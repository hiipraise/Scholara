# app/services/job_worker.py
"""
MongoDB-backed background worker for PDF processing jobs.

Replaces FastAPI BackgroundTasks with a persistent, restart-resilient worker.
Job state lives entirely in MongoDB — no Redis, no Celery, no extra infra.

Jobs receive a processing lease, so stalled work is requeued without
reclaiming healthy in-flight work. Exponential backoff is recorded in the job
document and survives reboots.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from bson import ObjectId

from app.core.config import settings
from app.core.database import pdf_jobs_col, pdfs_col, questions_col
from app.services.ai_service import process_pdf_file
from app.services.intelligence_service import upsert_course_intelligence

logger = logging.getLogger(__name__)

# ════════════════════════════════════════════════════════════════════════════
# GLOBALS — worker lifecycle
# ════════════════════════════════════════════════════════════════════════════

_running = False
_task: asyncio.Task | None = None

# ════════════════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════════════════

async def _update_job(job_id: str, data: dict) -> None:
    """Patch a job document with the given fields."""
    await pdf_jobs_col().update_one(
        {"_id": ObjectId(job_id)},
        {"$set": data},
    )


async def _recover_stalled_jobs() -> None:
    """Requeue only jobs whose processing lease has expired.

    A server starting while another worker is active must not reclaim that
    worker's job.  The prior implementation reset *every* processing job at
    startup, which could cause duplicate work; without a restart, a hung AI
    request could also leave a job processing indefinitely.
    """
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=settings.PDF_PROCESSING_TIMEOUT_SECONDS)
    result = await pdf_jobs_col().update_many(
        {
            "status": {"$in": ["processing", "claimed"]},
            "$or": [
                {"processing_started_at": {"$lte": cutoff}},
                {"processing_started_at": None, "updated_at": {"$lte": cutoff}},
                {"processing_started_at": {"$exists": False}, "updated_at": {"$lte": cutoff}},
            ],
        },
        {
            "$set": {
                "status": "pending",
                "updated_at": now,
                "processing_started_at": None,
                "last_error": "Processing lease expired; requeued for retry.",
            },
        },
    )
    if result.modified_count > 0:
        logger.warning("Requeued %d stalled PDF job(s)", result.modified_count)


# ════════════════════════════════════════════════════════════════════════════
# PROCESS ONE JOB — extracted from courses.py, no BackgroundTasks dependency
# ════════════════════════════════════════════════════════════════════════════

async def _process_pdf_bg(
    job_id: str,
    pdf_id: str,
    file_path: str,
    course_code: str,
    course_title: str,
    week_number: int | None,
    course_id: str,
    is_course_material: bool = False,
) -> None:
    """
    Execute the full PDF processing pipeline for a single job.
    Updates the job document at each stage so progress survives a crash.
    """
    try:
        job_doc = await pdf_jobs_col().find_one({"_id": ObjectId(job_id)})
        attempt = int((job_doc or {}).get("attempt_count", 0)) + 1

        await _update_job(job_id, {
            "status": "processing",
            "attempt_count": attempt,
            "last_attempt_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "last_error": None,
            "processing_started_at": datetime.utcnow(),
        })

        # ── Core AI processing ─────────────────────────────────────────
        # The provider SDK can otherwise wait forever on a broken network
        # connection, leaving the upload permanently marked as processing.
        data = await asyncio.wait_for(
            process_pdf_file(
                file_path, course_code, course_title, week_number or 0,
                course_id=course_id,
                generate_questions_for_pdf=not is_course_material,
            ),
            timeout=settings.PDF_PROCESSING_TIMEOUT_SECONDS,
        )

        # ── Persist PDF metadata ───────────────────────────────────────
        await pdfs_col().update_one(
            {"_id": ObjectId(pdf_id)},
            {"$set": {
                "summary": data["summary"],
                "key_points": data["key_points"],
                "key_formulas": data["key_formulas"],
                "extracted_text": data.get("extracted_text", ""),
                "is_processed": True,
            }},
        )

        # ── Persist generated questions ────────────────────────────────
        q_docs = []
        for q in ([] if is_course_material else data["questions"]):
            q_docs.append({
                "course_id": course_id,
                "pdf_id": pdf_id,
                "week_number": week_number,
                "question_text": q["question_text"],
                "question_type": q.get("question_type", "mcq"),
                "options": q.get("options"),
                "correct_answer": q["correct_answer"],
                "explanation": q.get("explanation", ""),
                "difficulty": q.get("difficulty", "medium"),
                "topic": q.get("topic", ""),
                "question_style": q.get("question_style", "application"),
                "depth_level": q.get("depth_level", "apply"),
                "solution_steps": q.get("solution_steps", []),
                "is_active": True,
                "source": "ai",
            })
        if q_docs:
            await questions_col().insert_many(q_docs)

        # ── Upsert course intelligence (topics, formulas, profile) ─────
        await upsert_course_intelligence(
            course_id=course_id,
            course_title=course_title,
            topics=data.get("topics", []),
            key_formulas=data.get("key_formulas", []),
            key_points=data.get("key_points", []),
            summary=data.get("summary", ""),
            formula_cards=data.get("formula_cards", []),
            profile_data=data.get("profile", {}),
        )

        # ── Mark job done ──────────────────────────────────────────────
        await _update_job(job_id, {
            "status": "done",
            "attempt_count": attempt,
            "completed_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "last_error": None,
            "processing_started_at": None,
        })

    except Exception as e:
        job_doc = await pdf_jobs_col().find_one({"_id": ObjectId(job_id)})
        attempt = int((job_doc or {}).get("attempt_count", 0))
        error_text = (
            f"PDF processing exceeded the {settings.PDF_PROCESSING_TIMEOUT_SECONDS}-second timeout"
            if isinstance(e, TimeoutError)
            else str(e)
        )
        logger.error("PDF job %s failed (attempt %d): %s", job_id, attempt, error_text)

        if attempt < 3:
            # ── Exponential backoff: wait 2^attempt seconds before retry ──
            backoff_sec = min(2 ** attempt, 30)  # cap at 30 s
            await _update_job(job_id, {
                "status": "pending",
                "attempt_count": attempt,
                "last_error": error_text,
                "updated_at": datetime.utcnow(),
                "next_attempt_at": datetime.utcnow() + timedelta(seconds=backoff_sec),
                "processing_started_at": None,
            })
            logger.info(
                "Job %s queued for retry in %ds (attempt %d/3)",
                job_id, backoff_sec, attempt,
            )
            return

        # ── Give up ────────────────────────────────────────────────────
        await _update_job(job_id, {
            "status": "failed",
            "attempt_count": attempt,
            "failed_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "last_error": error_text,
            "processing_started_at": None,
        })


# ════════════════════════════════════════════════════════════════════════════
# WORKER LOOP
# ════════════════════════════════════════════════════════════════════════════

async def _poll_loop(poll_interval: float = 5.0) -> None:
    """
    Background loop: poll pdf_jobs for pending/failed jobs, claim one
    atomically, and process it.
    """
    global _running
    _running = True

    try:
        await _recover_stalled_jobs()
    except Exception as exc:
        logger.warning("Job recovery failed (will retry on next start): %s", exc)

    while _running:
        try:
            # ── Atomically claim a pending job eligible for retry ────────
            now = datetime.utcnow()
            job = await pdf_jobs_col().find_one_and_update(
                {
                    "status": "pending",
                    "$or": [
                        {"next_attempt_at": None},
                        {"next_attempt_at": {"$lte": now}},
                    ],
                },
                {"$set": {"status": "claimed", "updated_at": now}},
                sort=[("updated_at", 1)],
            )

            if job:
                job_id = str(job["_id"])
                logger.info("Worker claimed job %s (%s)", job_id, job.get("file_name", ""))

                await _process_pdf_bg(
                    job_id=job_id,
                    pdf_id=job["pdf_id"],
                    file_path=job["file_path"],
                    course_code=job["course_code"],
                    course_title=job["course_title"],
                    week_number=job.get("week_number"),
                    course_id=job["course_id"],
                    is_course_material=job.get("is_course_material", False),
                )
            else:
                # ── No job available — wait and try again ──────────────
                await asyncio.sleep(poll_interval)

        except asyncio.CancelledError:
            logger.info("Worker poll loop cancelled — shutting down.")
            break
        except Exception as exc:
            logger.error("Worker poll loop error: %s", exc, exc_info=True)
            await asyncio.sleep(poll_interval)


# ════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ════════════════════════════════════════════════════════════════════════════

async def start_worker(poll_interval: float = 5.0) -> None:
    """Start the background worker as an asyncio task."""
    global _task
    if _task is not None and not _task.done():
        logger.warning("Worker is already running — ignoring start request.")
        return
    _task = asyncio.create_task(_poll_loop(poll_interval))
    logger.info("PDF job worker started (poll interval = %.1fs)", poll_interval)


async def stop_worker() -> None:
    """Gracefully stop the background worker."""
    global _running, _task
    _running = False
    if _task is not None and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
        logger.info("PDF job worker stopped.")
