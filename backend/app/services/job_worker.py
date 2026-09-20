# app/services/job_worker.py
"""
MongoDB-backed background worker for PDF processing jobs.

Replaces FastAPI BackgroundTasks with a persistent, restart-resilient worker.
Job state lives entirely in MongoDB — no Redis, no Celery, no extra infra.

Jobs run as resumable stages (extract → analyse → generate → persist) with each
stage persisted independently, so a failed AI step can be retried without
re-reading the PDF. Jobs receive a per-stage processing lease, so stalled work
is requeued without reclaiming healthy in-flight work. Exponential backoff is
recorded in the job document and survives reboots.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from bson import ObjectId

from app.core.config import settings
from app.core.database import pdf_jobs_col, pdfs_col, questions_col
from app.services.ai_service import (
    analyze_pdf_text,
    build_adaptive_context,
    extract_pdf_text,
    generate_questions,
)
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
    # The lease is renewed at every stage, so the cutoff must sit a little past a
    # single stage's timeout — otherwise a stage running right up to its limit
    # could be reclaimed while it is still healthy.
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=settings.PDF_PROCESSING_TIMEOUT_SECONDS + 60)
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
                "next_attempt_at": None,
                "last_error": "Processing lease expired; requeued for retry.",
            },
        },
    )
    if result.modified_count > 0:
        logger.warning("Requeued %d stalled PDF job(s)", result.modified_count)


# ════════════════════════════════════════════════════════════════════════════
# PROCESS ONE JOB — extracted from courses.py, no BackgroundTasks dependency
# ════════════════════════════════════════════════════════════════════════════

async def _set_stage(job_id: str, stage: str) -> None:
    """Record the current stage and renew the processing lease.

    Renewing ``processing_started_at`` per stage keeps the recovery lease
    per-stage, so a job that is legitimately working through several stages is
    not mistaken for a stalled one and requeued mid-flight.
    """
    now = datetime.utcnow()
    await _update_job(job_id, {
        "stage": stage,
        "updated_at": now,
        "processing_started_at": now,
    })


async def _process_pdf_bg(
    job_id: str,
    pdf_id: str,
    file_path: str,
    course_code: str,
    course_title: str,
    week_number: int | None,
    course_id: str,
    is_course_material: bool = False,
    question_count: int = 20,
    assessment_type: str = "mcq",
) -> None:
    """
    Run the PDF pipeline in resumable stages: extract → analyse → generate → persist.

    Each stage persists its output before the next one starts, so a failure in a
    later AI stage never throws away already-extracted text (and a retry resumes
    at the failed stage instead of re-reading the PDF and re-billing). Question
    persistence is idempotent: existing rows for the PDF are replaced, never
    duplicated.
    """
    timeout = settings.PDF_PROCESSING_TIMEOUT_SECONDS
    try:
        job_doc = await pdf_jobs_col().find_one({"_id": ObjectId(job_id)})
        attempt = int((job_doc or {}).get("attempt_count", 0)) + 1
        await _set_stage(job_id, "extracting")
        await _update_job(job_id, {
            "status": "processing",
            "attempt_count": attempt,
            "last_attempt_at": datetime.utcnow(),
            "last_error": None,
        })

        pdf_doc = await pdfs_col().find_one({"_id": ObjectId(pdf_id)}) or {}

        # ── Stage 1: extract text (local, no AI) ───────────────────────
        text = pdf_doc.get("extracted_text") if pdf_doc.get("extraction_complete") else None
        if text:
            logger.info("Job %s: reusing stored extracted text (skipping extraction)", job_id)
        else:
            await _set_stage(job_id, "extracting")
            # PyMuPDF is blocking — run it off the event loop so the worker and
            # other requests keep moving while a large PDF is read.
            text = await asyncio.wait_for(
                asyncio.to_thread(extract_pdf_text, file_path),
                timeout=timeout,
            )
            await pdfs_col().update_one(
                {"_id": ObjectId(pdf_id)},
                {"$set": {
                    "extracted_text": text,
                    "text_length": len(text),
                    "extraction_complete": True,
                }},
            )

        # ── Stage 2: analyse content (summary + profile) ───────────────
        if pdf_doc.get("analysis_complete"):
            logger.info("Job %s: reusing stored analysis (skipping summarisation)", job_id)
            summary_data = {
                "summary": pdf_doc.get("summary", ""),
                "key_points": pdf_doc.get("key_points", []),
                "key_formulas": pdf_doc.get("key_formulas", []),
                "formula_cards": pdf_doc.get("formula_cards", []),
                "topics": pdf_doc.get("topics", []),
                "profile": pdf_doc.get("profile"),
            }
        else:
            await _set_stage(job_id, "analyzing")
            summary_data, _profile, _ctx = await asyncio.wait_for(
                analyze_pdf_text(text, course_title),
                timeout=timeout,
            )
            await pdfs_col().update_one(
                {"_id": ObjectId(pdf_id)},
                {"$set": {
                    "summary": summary_data.get("summary", ""),
                    "key_points": summary_data.get("key_points", []),
                    "key_formulas": summary_data.get("key_formulas", []),
                    "formula_cards": summary_data.get("formula_cards", []),
                    "topics": summary_data.get("topics", []),
                    "profile": summary_data.get("profile"),
                    "analysis_complete": True,
                }},
            )

        _, adaptive_context = build_adaptive_context(summary_data, course_title)

        # ── Stage 3: generate questions ────────────────────────────────
        if not is_course_material and not pdf_doc.get("questions_complete"):
            await _set_stage(job_id, "generating")
            questions = await asyncio.wait_for(
                generate_questions(
                    text, course_code, course_title, week_number or 0,
                    question_count, adaptive_context, course_id,
                    assessment_type=assessment_type,
                ),
                timeout=timeout,
            )
            if len(questions) != question_count:
                raise RuntimeError(
                    f"Refusing to save incomplete question set: expected {question_count}, got {len(questions)}"
                )
            # Replace, never append — keeps retries idempotent.
            await questions_col().delete_many({"pdf_id": pdf_id})
            await questions_col().insert_many([
                {
                    "course_id": course_id,
                    "pdf_id": pdf_id,
                    "week_number": week_number,
                    "question_text": q["question_text"],
                    "question_type": q.get("question_type", "mcq"),
                    "options": q.get("options"),
                    "correct_answer": q.get("correct_answer"),
                    "explanation": q.get("explanation", ""),
                    "difficulty": q.get("difficulty", "medium"),
                    "topic": q.get("topic", ""),
                    "question_style": q.get("question_style", "application"),
                    "depth_level": q.get("depth_level", "apply"),
                    "solution_steps": q.get("solution_steps", []),
                    "source_excerpt": q.get("source_excerpt", ""),
                    "is_active": True,
                    "source": "ai",
                }
                for q in questions
            ])
            await pdfs_col().update_one(
                {"_id": ObjectId(pdf_id)},
                {"$set": {"questions_complete": True}},
            )

        # ── Stage 4: course intelligence (auxiliary, non-fatal) ────────
        await _set_stage(job_id, "persisting")
        try:
            await upsert_course_intelligence(
                course_id=course_id,
                course_title=course_title,
                topics=summary_data.get("topics", []),
                key_formulas=summary_data.get("key_formulas", []),
                key_points=summary_data.get("key_points", []),
                summary=summary_data.get("summary", ""),
                formula_cards=summary_data.get("formula_cards", []),
                profile_data=summary_data.get("profile") or {},
            )
        except Exception as exc:
            logger.warning(
                "Job %s: course intelligence upsert failed (non-fatal): %s", job_id, exc
            )

        # ── Mark processed + job done ──────────────────────────────────
        await pdfs_col().update_one(
            {"_id": ObjectId(pdf_id)},
            {"$set": {"is_processed": True}},
        )
        await _update_job(job_id, {
            "status": "done",
            "stage": "done",
            "attempt_count": attempt,
            "completed_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "last_error": None,
            "processing_started_at": None,
        })

    except Exception as e:
        job_doc = await pdf_jobs_col().find_one({"_id": ObjectId(job_id)})
        attempt = int((job_doc or {}).get("attempt_count", 0))
        stage = (job_doc or {}).get("stage")
        error_text = (
            f"PDF {stage or 'processing'} exceeded the {settings.PDF_PROCESSING_TIMEOUT_SECONDS}-second timeout"
            if isinstance(e, TimeoutError)
            else str(e)
        )
        logger.error(
            "PDF job %s failed at stage %s (attempt %d): %s", job_id, stage, attempt, error_text
        )

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
                    question_count=int(job.get("question_count") or 20),
                    assessment_type=job.get("assessment_type", "mcq"),
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
