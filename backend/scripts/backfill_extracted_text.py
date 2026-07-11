"""
One-off migration: backfill the `extracted_text` field for legacy PDF documents.

The `course_pdfs` collection now persists extracted lecture text in the
`extracted_text` field at processing time (see job_worker.py).  PDFs that
were processed before this change do not have the field, so "Teach Me"
lesson generation falls back to web-only content for those weeks.

This script finds every processed PDF missing `extracted_text`, attempts
to re-read the file from disk (via PyMuPDF / `extract_text_from_pdf`),
and saves the extracted text back into the document.  If the PDF file is
no longer on disk (ephemeral storage), the document is skipped with a
warning — no AI calls are made, no summaries or questions are regenerated.

Usage:
    cd backend
    python scripts/backfill_extracted_text.py

Safe to re-run — skips docs that already have `extracted_text`.
"""
import asyncio
import logging
import sys
from pathlib import Path

# ── Ensure the project root is on sys.path so app imports work ────────────
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import pdfs_col, get_client
from app.services.ai_service import extract_text_from_pdf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("backfill_extracted_text")


async def main() -> None:
    # ── Find legacy PDFs ─────────────────────────────────────────────
    missing_filter = {
        "is_processed": True,
        "$or": [
            {"extracted_text": {"$exists": False}},
            {"extracted_text": None},
            {"extracted_text": ""},
        ],
    }

    total = await pdfs_col().count_documents(missing_filter)
    if total == 0:
        logger.info(
            "No legacy PDFs found — all processed docs already have "
            "extracted_text. Nothing to do."
        )
        return

    logger.info("Found %d processed PDF(s) missing extracted_text", total)

    cursor = pdfs_col().find(missing_filter).sort(
        [("course_id", 1), ("week_number", 1)],
    )

    ok = 0
    skipped = 0

    try:
        async for pdf in cursor:
            file_path = pdf.get("file_path", "")
            course_id = pdf.get("course_id", "?")
            week = pdf.get("week_number", "?")
            label = f"{course_id} / week {week}"

            if not file_path:
                logger.warning("[%s] No file_path field — skipping", label)
                skipped += 1
                continue

            try:
                text = extract_text_from_pdf(file_path)
            except Exception as exc:
                logger.warning(
                    "[%s] Could not read %s — %s "
                    "(file may have been deleted from ephemeral storage)",
                    label, file_path, exc,
                )
                skipped += 1
                continue

            if not text.strip():
                logger.warning(
                    "[%s] Extracted text is empty — file may be "
                    "unreadable (%s)", label, file_path,
                )
                skipped += 1
                continue

            await pdfs_col().update_one(
                {"_id": pdf["_id"]},
                {"$set": {"extracted_text": text}},
            )

            char_count = len(text)
            logger.info(
                "[%s] ✅ Backfilled %s characters from %s",
                label, f"{char_count:,}", file_path,
            )
            ok += 1
    finally:
        await cursor.close()
        get_client().close()

    # ── Summary ───────────────────────────────────────────────────────
    sep = "─" * 55
    print(f"\n{sep}")
    print(f"  BACKFILL COMPLETE")
    print(f"{sep}")
    print(f"  Total legacy PDFs found:   {total}")
    print(f"  ✅ Backfilled:             {ok}")
    print(f"  ⏭️  Skipped (no file):      {skipped}")
    print(f"{sep}\n")

    if skipped > 0 and ok == 0:
        print(
            "  ⚠️  All PDFs were skipped because the files are no longer on disk.\n"
            "     Re-upload the affected PDFs to populate extracted_text.\n"
        )


if __name__ == "__main__":
    asyncio.run(main())
