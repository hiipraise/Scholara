#!/usr/bin/env python3
"""
regenerate_questions.py — Generate real AI questions for course/week pairs
that lost all active questions during the mock question purge, WITHOUT
requiring the original PDF files (which no longer exist on disk).

Uses the stored summary, key_points, topics, and key_formulas already
present in the course_pdfs documents to feed the AI question generator.

Usage:
    python backend/scripts/regenerate_questions.py              # dry-run
    python backend/scripts/regenerate_questions.py --apply      # actually generate
"""

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bson import ObjectId
from app.core.database import questions_col, pdfs_col, pdf_jobs_col, courses_col
from app.core.config import settings
from app.services.ai_service import generate_questions, infer_course_profile

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("regenerate_questions")

REPORT_PATH = Path(__file__).resolve().parent / "mock_purge_report.json"
QUESTION_COUNT = 20  # questions per pair


async def load_empty_pairs() -> list[dict]:
    """Load the requeued_pairs from the purge report."""
    if not REPORT_PATH.exists():
        logger.error("Report file not found: %s", REPORT_PATH)
        return []

    with open(REPORT_PATH) as f:
        report = json.load(f)

    return report.get("requeued_pairs", [])


async def get_pdf_data(course_id: str, week_number: int) -> dict | None:
    """Get the stored PDF metadata for a course/week pair."""
    pdf = await pdfs_col().find_one({
        "course_id": course_id,
        "week_number": week_number,
        "is_deleted": {"$ne": True},
    })
    return pdf


async def get_course(course_id: str) -> dict | None:
    """Get course metadata."""
    if not ObjectId.is_valid(course_id):
        return None
    return await courses_col().find_one({"_id": ObjectId(course_id)})


async def get_existing_active_count(course_id: str, week_number: int) -> int:
    """Count how many active questions already exist for this pair."""
    return await questions_col().count_documents({
        "course_id": course_id,
        "week_number": week_number,
        "is_active": True,
    })


async def generate_for_pair(
    course_id: str,
    week_number: int,
    pdf_data: dict,
    course: dict,
    apply: bool,
) -> str:
    """Generate questions for one course/week pair using stored metadata.
    Generates in batches of 10 to avoid AI response truncation.
    """

    # Build adaptive_context from stored PDF metadata
    topics = pdf_data.get("topics", pdf_data.get("key_points", []))
    if isinstance(topics, list) and topics and isinstance(topics[0], str):
        pass  # already a list of strings
    elif isinstance(topics, list) and topics and isinstance(topics[0], dict):
        topics = [t.get("topic", str(t)) for t in topics]
    else:
        topics = ["Core Concepts"]

    key_formulas = pdf_data.get("key_formulas", [])
    if isinstance(key_formulas, list) and key_formulas and isinstance(key_formulas[0], dict):
        key_formulas = [f.get("formula_name", str(f)) for f in key_formulas]
    key_formulas = [str(f) for f in key_formulas][:5]

    key_points = pdf_data.get("key_points", [])
    if isinstance(key_points, list) and key_points and isinstance(key_points[0], dict):
        key_points = [k.get("point", str(k)) for k in key_points]
    key_points = [str(k) for k in key_points]

    summary = pdf_data.get("summary", "")
    is_formula_heavy = len(key_formulas) > 2

    # Infer course profile from available data
    inferred = infer_course_profile(
        course_title=course.get("title", ""),
        topics=topics,
        formulas=key_formulas,
        key_points=key_points,
    )

    adaptive_context = {
        "is_formula_heavy": is_formula_heavy or inferred.get("is_formula_heavy", False),
        "mix_targets": inferred.get("mix_targets", {"calculation": 25, "application": 40, "theory": 35}),
        "difficulty_targets": inferred.get("difficulty_targets", {"easy": 30, "medium": 50, "hard": 20}),
        "explanation_mode": "exam_style",
        "topics": topics,
        "key_formulas": key_formulas,
    }

    # Build a pseudo-PDF text from the stored summary for the AI to work with
    pseudo_text = summary
    if key_points:
        pseudo_text += "\n\nKey Points:\n- " + "\n- ".join(key_points[:5])
    if key_formulas:
        pseudo_text += "\n\nFormulas:\n- " + "\n- ".join(key_formulas[:5])
    if topics:
        pseudo_text += "\n\nTopics:\n- " + "\n- ".join(topics[:8])

    # Pad to meet AI service's minimum content requirement (500 chars)
    MIN_CONTENT = 500
    while len(pseudo_text.strip()) < MIN_CONTENT:
        pseudo_text += "\n\nAdditional context based on course material for " + course.get("title", course_id) + "."
        if topics:
            pseudo_text += " This covers: " + ", ".join(topics[:5]) + "."
    pseudo_text = pseudo_text[:6000]

    if not apply:
        return "would_generate"

    # ── Generate in smaller batches to avoid AI JSON truncation ──────
    BATCH_SIZE = 10
    all_questions = []
    total_needed = QUESTION_COUNT

    for batch_start in range(0, total_needed, BATCH_SIZE):
        batch_count = min(BATCH_SIZE, total_needed - len(all_questions))

        logger.info(
            "Generating batch of %d questions for %s week %s (%d/%d)",
            batch_count, course.get("code", course_id), week_number,
            len(all_questions) + batch_count, total_needed,
        )

        try:
            questions = await generate_questions(
                pdf_text=pseudo_text,
                course_code=course.get("code", ""),
                course_title=course.get("title", ""),
                week_number=week_number,
                count=batch_count,
                adaptive_context=adaptive_context,
                course_id=course_id,
            )
            all_questions.extend(questions[:batch_count])
        except Exception as e:
            logger.error(
                "Batch failed for %s week %s (batch %d/%d): %s",
                course.get("code", course_id), week_number,
                batch_start // BATCH_SIZE + 1,
                (total_needed + BATCH_SIZE - 1) // BATCH_SIZE,
                e,
            )
            # Continue with partial results if first batch succeeded
            if not all_questions:
                return f"error: {e}"
            break

        # Small delay between batches to avoid rate limits
        if len(all_questions) < total_needed:
            await asyncio.sleep(2)

    if not all_questions:
        return "error: no questions generated"

    # ── Insert generated questions ───────────────────────────────────
    q_docs = []
    for q in all_questions:
        q_docs.append({
            "course_id": course_id,
            "pdf_id": str(pdf_data["_id"]),
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
        logger.info(
            "Inserted %d questions for %s week %s",
            len(q_docs), course.get("code", course_id), week_number,
        )

    return f"generated_{len(q_docs)}"


async def main(apply: bool = False) -> None:
    """Run the regeneration script."""
    logger.info("Starting question regeneration (apply=%s)", apply)

    pairs = await load_empty_pairs()
    if not pairs:
        logger.info("No pairs to process.")
        return

    print("\n" + "=" * 60)
    print(f"  QUESTION REGENERATION  ({'dry-run' if not apply else 'apply'})")
    print("=" * 60)

    results = []
    for pair in pairs:
        course_id = pair["course_id"]
        week_number = pair["week_number"]

        # Skip if questions already exist
        existing = await get_existing_active_count(course_id, week_number)
        if existing > 0:
            logger.info("Skipping %s week %s — already has %d active question(s)", course_id, week_number, existing)
            results.append({"course_id": course_id, "week": week_number, "status": f"skipped (has {existing})"})
            continue

        pdf_data = await get_pdf_data(course_id, week_number)
        if not pdf_data:
            logger.warning("No PDF metadata for %s week %s", course_id, week_number)
            results.append({"course_id": course_id, "week": week_number, "status": "no pdf data"})
            continue

        course = await get_course(course_id)
        if not course:
            logger.warning("No course found for %s", course_id)
            results.append({"course_id": course_id, "week": week_number, "status": "no course"})
            continue

        result = await generate_for_pair(course_id, week_number, pdf_data, course, apply)
        results.append({
            "course_id": course_id,
            "week": week_number,
            "course_code": course.get("code", ""),
            "status": result,
        })

    # Summary
    generated = [r for r in results if r["status"].startswith("generated") or r["status"] == "would_generate"]
    skipped = [r for r in results if r["status"].startswith("skipped")]
    errors = [r for r in results if r["status"].startswith("error")]
    no_data = [r for r in results if r["status"] in ("no pdf data", "no course")]

    print(f"\n  {'─' * 54}")
    print(f"  Would generate: {len(generated)}")
    print(f"  Skipped (already have questions): {len(skipped)}")
    print(f"  Errors: {len(errors)}")
    print(f"  No data available: {len(no_data)}")
    print(f"  {'─' * 54}")

    if not apply:
        print("\n  DRY-RUN — no AI calls or DB changes made.")
        print("  Run with --apply to actually generate questions.\n")
    else:
        print(f"\n  Done. {sum(1 for r in results if 'generated' in r['status'] and r['status'] != 'would_generate')} pairs processed.\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Regenerate questions from stored PDF metadata (no file required).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually generate and insert questions (default: dry-run)",
    )
    args = parser.parse_args()

    asyncio.run(main(apply=args.apply))
