#!/usr/bin/env python3
"""
seed_pdf_jobs.py — Create missing pdf_jobs entries for course/week pairs
that lost all their active questions during mock question deactivation.

The purge script (purge_mock_questions.py) attempted to requeue these pairs
by resetting existing pdf_jobs entries, but none existed (the PDFs were uploaded
before the pdf_jobs background worker system was introduced).

This script reads the requeued_pairs from mock_purge_report.json, finds the
matching PDF documents in course_pdfs, looks up the course metadata, and creates
fresh pdf_jobs entries so job_worker.py can process them.

Usage:
    python backend/scripts/seed_pdf_jobs.py              # dry-run (preview)
    python backend/scripts/seed_pdf_jobs.py --apply      # actually create jobs
"""

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

# Add backend root to sys.path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bson import ObjectId
from app.core.database import pdfs_col, questions_col, pdf_jobs_col, courses_col

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("seed_pdf_jobs")

REPORT_PATH = Path(__file__).resolve().parent / "mock_purge_report.json"


async def load_requeued_pairs() -> list[dict]:
    """Load the requeued_pairs from the purge report."""
    if not REPORT_PATH.exists():
        logger.error("Report file not found: %s", REPORT_PATH)
        logger.error("Run purge_mock_questions.py --apply first.")
        return []

    with open(REPORT_PATH) as f:
        report = json.load(f)

    pairs = report.get("requeued_pairs", [])
    logger.info("Loaded %d requeued pair(s) from report", len(pairs))
    return pairs


async def find_pdf_for_pair(course_id: str, week_number: int) -> dict | None:
    """Find a non-deleted PDF document for the given course/week."""
    pdf = await pdfs_col().find_one({
        "course_id": course_id,
        "week_number": week_number,
        "is_deleted": {"$ne": True},
    })
    return pdf


async def find_course(course_id: str) -> dict | None:
    """Find a course by its string ID."""
    if not ObjectId.is_valid(course_id):
        logger.warning("Invalid ObjectId for course: %s", course_id)
        return None
    return await courses_col().find_one({"_id": ObjectId(course_id)})


async def check_active_questions(course_id: str, week_number: int) -> int:
    """Count active (non-mock) questions remaining for the course/week pair."""
    return await questions_col().count_documents({
        "course_id": course_id,
        "week_number": week_number,
        "is_active": True,
        "source": {"$ne": "mock"},
    })


async def job_exists(pdf_id: str) -> bool:
    """Check if a pdf_jobs entry already exists for this PDF."""
    count = await pdf_jobs_col().count_documents({"pdf_id": pdf_id})
    return count > 0


async def main(apply: bool = False) -> None:
    """Run the seed script."""
    logger.info("Starting pdf_jobs seed (apply=%s)", apply)

    pairs = await load_requeued_pairs()
    if not pairs:
        logger.info("No pairs to process.")
        return

    results = []
    for pair in pairs:
        course_id = pair["course_id"]
        week_number = pair["week_number"]

        # Skip pairs that already have active questions again
        active_count = await check_active_questions(course_id, week_number)
        if active_count > 0:
            logger.info(
                "Skipping course=%s week=%s — already has %d active question(s) (may have been regenerated)",
                course_id, week_number, active_count,
            )
            continue

        # Find the PDF document
        pdf = await find_pdf_for_pair(course_id, week_number)
        if not pdf:
            logger.warning(
                "No PDF found for course=%s week=%s — cannot seed job",
                course_id, week_number,
            )
            results.append({
                "course_id": course_id,
                "week_number": week_number,
                "status": "skipped",
                "reason": "no PDF found in course_pdfs",
            })
            continue

        pdf_id = str(pdf["_id"])

        # Check if a job already exists for this PDF
        if await job_exists(pdf_id):
            # Reset it instead of creating a duplicate
            if apply:
                await pdf_jobs_col().update_one(
                    {"pdf_id": pdf_id},
                    {"$set": {
                        "status": "pending",
                        "attempt_count": 0,
                        "last_error": None,
                        "next_attempt_at": None,
                        "updated_at": datetime.utcnow(),
                    }},
                )
                logger.info("Reset existing job for pdf_id=%s", pdf_id)
            else:
                logger.info("Would reset existing job for pdf_id=%s (dry-run)", pdf_id)
            results.append({
                "course_id": course_id,
                "week_number": week_number,
                "pdf_id": pdf_id,
                "status": "reset" if apply else "would_reset",
            })
            continue

        # Look up course metadata
        course = await find_course(course_id)
        if not course:
            logger.warning(
                "No course found for course_id=%s — cannot seed job",
                course_id,
            )
            results.append({
                "course_id": course_id,
                "week_number": week_number,
                "status": "skipped",
                "reason": "course not found",
            })
            continue

        file_path = pdf.get("file_path", "")
        file_name = pdf.get("original_name") or pdf.get("filename", "unknown.pdf")

        # Build the job document matching the schema from courses.py
        job_doc = {
            "job_type": "pdf_processing",
            "status": "pending",
            "attempt_count": 0,
            "max_attempts": 3,
            "course_id": course_id,
            "course_code": course["code"],
            "course_title": course["title"],
            "pdf_id": pdf_id,
            "week_number": week_number,
            "file_path": file_path,
            "file_name": file_name,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        if apply:
            result = await pdf_jobs_col().insert_one(job_doc)
            job_id = str(result.inserted_id)
            logger.info(
                "Created pdf_job %s for course=%s week=%s (pdf=%s)",
                job_id, course_id, week_number, pdf_id,
            )
            results.append({
                "course_id": course_id,
                "week_number": week_number,
                "pdf_id": pdf_id,
                "job_id": job_id,
                "status": "created",
            })
        else:
            logger.info(
                "Would create pdf_job for course=%s week=%s (pdf=%s, course_code=%s)",
                course_id, week_number, pdf_id, course["code"],
            )
            results.append({
                "course_id": course_id,
                "week_number": week_number,
                "pdf_id": pdf_id,
                "course_code": course["code"],
                "status": "would_create",
            })

    # ── Print summary ───────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  SEED PDF JOBS REPORT" + ("  (dry-run)" if not apply else ""))
    print("=" * 60)

    created = [r for r in results if r["status"] in ("created", "would_create")]
    reset = [r for r in results if r["status"] in ("reset", "would_reset")]
    skipped = [r for r in results if r["status"] == "skipped"]

    if created:
        print(f"\n  {'─' * 54}")
        print(f"  New jobs to create: {len(created)}")
        for r in created:
            print(f"    course={r['course_id']} week={r['week_number']} pdf={r.get('pdf_id', '?')}")
        print(f"  {'─' * 54}")

    if reset:
        print(f"\n  Existing jobs to reset: {len(reset)}")
        for r in reset:
            print(f"    course={r['course_id']} week={r['week_number']} pdf={r.get('pdf_id', '?')}")

    if skipped:
        print(f"\n  Skipped: {len(skipped)}")
        for r in skipped:
            print(f"    course={r['course_id']} week={r['week_number']} — {r.get('reason', 'unknown')}")

    print(f"\n  {'─' * 54}")
    print(f"  TOTAL pairs processed: {len(results)}")
    print(f"  {'─' * 54}")

    if not apply:
        print("\n  DRY-RUN — no changes made.")
        print("  Run with --apply to create the jobs.\n")
    else:
        print("\n  Done. The job_worker.py background process will pick up")
        print("  the new pending jobs and generate real AI questions.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create missing pdf_jobs entries for orphaned course/week pairs.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually create job entries (default: dry-run)",
    )
    args = parser.parse_args()

    asyncio.run(main(apply=args.apply))
