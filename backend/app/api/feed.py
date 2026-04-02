# app/api/feed.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, date

from app.core.deps import get_current_user
from app.core.database import progress_col, courses_col, attempts_col, calendars_col
from app.services.feed_service import (
    get_or_create_daily_feed, submit_answer,
    get_unlocked_week, get_active_calendar, _academic_week,
)

router = APIRouter()


class AnswerRequest(BaseModel):
    question_id: str
    selected_answer: str


class MarkWeekRequest(BaseModel):
    course_id: str
    week_number: int
    is_done: bool


@router.get("/today")
async def today_feed(current_user: dict = Depends(get_current_user)):
    return await get_or_create_daily_feed(current_user)


@router.post("/answer")
async def answer(body: AnswerRequest, current_user: dict = Depends(get_current_user)):
    try:
        return await submit_answer(current_user["id"], body.question_id, body.selected_answer)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/progress")
async def get_progress(current_user: dict = Depends(get_current_user)):
    level, semester = current_user["level"], current_user["semester"]
    cal = await get_active_calendar(level, semester)
    current_week = _academic_week(cal.get("lectures_start_date") if cal else None)

    courses = await courses_col().find(
        {"level": level, "semester": semester, "is_active": True}
    ).to_list(None)

    result = []
    for c in courses:
        cid = str(c["_id"])
        # all done weeks
        done_docs = await progress_col().find(
            {"user_id": current_user["id"], "course_id": cid, "is_done": True},
            {"week_number": 1}
        ).to_list(None)
        weeks_done = sorted(d["week_number"] for d in done_docs)
        unlocked = weeks_done[-1] if weeks_done else 1

        result.append({
            "course_id": cid,
            "course_code": c["code"],
            "course_title": c["title"],
            "max_done_week": weeks_done[-1] if weeks_done else 0,
            "current_academic_week": current_week,
            "unlocked_week": unlocked,
            "weeks_done": weeks_done,
        })

    return {"current_academic_week": current_week, "courses": result}


@router.post("/mark-week-done")
async def mark_week_done(body: MarkWeekRequest, current_user: dict = Depends(get_current_user)):
    doc = await progress_col().find_one({
        "user_id": current_user["id"],
        "course_id": body.course_id,
        "week_number": body.week_number,
    })
    update = {
        "$set": {
            "is_done": body.is_done,
            "marked_done_at": datetime.utcnow().isoformat() if body.is_done else None,
        }
    }
    if doc:
        await progress_col().update_one({"_id": doc["_id"]}, update)
    else:
        await progress_col().insert_one({
            "user_id": current_user["id"],
            "course_id": body.course_id,
            "week_number": body.week_number,
            "is_done": body.is_done,
            "marked_done_at": datetime.utcnow().isoformat() if body.is_done else None,
        })
    return {"message": f"Week {body.week_number} marked {'done' if body.is_done else 'not done'}"}


@router.get("/stats")
async def stats(current_user: dict = Depends(get_current_user)):
    total   = await attempts_col().count_documents({"user_id": current_user["id"]})
    correct = await attempts_col().count_documents({"user_id": current_user["id"], "is_correct": True})
    return {
        "total_attempted": total,
        "total_correct": correct,
        "accuracy": round(correct / total * 100, 1) if total else 0,
        "total_incorrect": total - correct,
    }
