# app/api/lessons.py
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from datetime import datetime
from bson import ObjectId

from app.core.deps import get_current_user, get_admin_user
from app.core.database import lessons_col, pdfs_col, courses_col
from app.services.feed_service import get_unlocked_week
from app.services.lesson_service import generate_lesson, chat_with_lesson
from app.core.rate_limiter import api_rate_limiter


router = APIRouter()


class LessonChatRequest(BaseModel):
    message: str
    history: list[dict] = Field(default_factory=list)


# ── Shared: build & persist a fresh lesson ─────────────────────────────────

async def _build_and_save_lesson(course_id: str, week_number: int) -> dict:
    """Find PDF + course, generate lesson via AI, insert into DB, return doc.

    If the PDF file cannot be read from disk (e.g. ephemeral storage after a
    container restart), the lecture text falls back to empty — the AI still
    generates a lesson grounded in web references and the course context.
    """
    pdf = await pdfs_col().find_one({
        "course_id": course_id,
        "week_number": week_number,
        "is_processed": True,
        "is_deleted": {"$ne": True},
    })
    if not pdf:
        raise HTTPException(404, "No processed lecture content for this week yet")

    course = await courses_col().find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(404, "Course not found")

    # Read extracted text from the PDF document (persisted in MongoDB at
    # processing time — no disk read needed). If missing (legacy PDFs before
    # this field was added), fall back to empty string so the AI still
    # generates a lesson from web references + course context.
    lecture_text = pdf.get("extracted_text") or ""

    try:
        lesson = await generate_lesson(
            course_id, course["code"], course["title"],
            week_number, lecture_text,
        )
    except Exception as e:
        raise HTTPException(500, str(e))

    doc = {
        **lesson,
        "course_id": course_id,
        "week_number": week_number,
        "course_code": course["code"],
        "course_title": course["title"],
        "source": "ai",
        "generated_at": datetime.utcnow(),
    }
    result = await lessons_col().insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


# ── GET /{course_id}/weeks/{week_number}/lesson ────────────────────────────

@router.get("/{course_id}/weeks/{week_number}/lesson")
async def get_lesson(
    course_id: str,
    week_number: int,
    current_user: dict = Depends(get_current_user),
):
    unlocked = await get_unlocked_week(current_user["id"], course_id)
    if week_number > unlocked:
        raise HTTPException(403, "This week isn't unlocked yet")

    # Return cached lesson if one exists
    existing = await lessons_col().find_one({
        "course_id": course_id, "week_number": week_number,
    })
    if existing:
        existing["_id"] = str(existing["_id"])
        return existing

    return await _build_and_save_lesson(course_id, week_number)


# ── POST /{course_id}/weeks/{week_number}/lesson/regenerate ────────────────

@router.post("/{course_id}/weeks/{week_number}/lesson/regenerate")
async def regenerate_lesson(
    course_id: str,
    week_number: int,
    admin: dict = Depends(get_admin_user),
):
    await lessons_col().delete_many({
        "course_id": course_id, "week_number": week_number,
    })
    return await _build_and_save_lesson(course_id, week_number)


# ── POST /{course_id}/weeks/{week_number}/lesson/chat ──────────────────────

@router.post("/{course_id}/weeks/{week_number}/lesson/chat")
async def lesson_chat(
    request: Request,
    course_id: str,
    week_number: int,
    body: LessonChatRequest,
    current_user: dict = Depends(get_current_user),
):
    # Rate limit: 15 requests per minute per user
    client_ip = request.client.host if request.client else "unknown"
    allowed, _, _ = await api_rate_limiter.is_allowed(
        f"lesson_chat:{current_user['id']}:{client_ip}",
        max_requests=15,
        window_minutes=1,
    )
    if not allowed:
        raise HTTPException(429, "Too many chat requests. Please slow down.")

    try:
        reply = await chat_with_lesson(
            course_id, week_number, body.message, body.history,
        )
        return {"reply": reply}
    except ValueError as e:
        raise HTTPException(404, str(e))
