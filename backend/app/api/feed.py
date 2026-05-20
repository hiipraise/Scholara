# app/api/feed.py
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from datetime import datetime, date, timedelta
from bson import ObjectId

from app.core.deps import get_current_user
from app.core.database import progress_col, courses_col, attempts_col, questions_col, calendars_col
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


class PracticeRequest(BaseModel):
    course_ids: list[str] = Field(default_factory=list)
    count: int = Field(default=30, ge=30, le=60)


async def _term_question_ids(level: str, semester: int) -> list[str]:
    courses = await courses_col().find(
        {"level": level, "semester": semester, "is_active": True},
        {"_id": 1},
    ).to_list(None)
    if not courses:
        return []
    cids = [str(c["_id"]) for c in courses]
    qids = await questions_col().distinct("_id", {"course_id": {"$in": cids}, "is_active": True})
    return [str(qid) for qid in qids]


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
    if not cal:
        cal = await calendars_col().find_one(
            {"level": level, "semester": semester},
            sort=[("_id", -1)],
        )
    current_week = _academic_week(
        cal.get("lectures_start_date") if cal else None,
        cal.get("semester_end_date") if cal else None,
    )
    if current_week < 1:
        current_week = 1

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
        max_done = weeks_done[-1] if weeks_done else 0
        unlocked = max_done + 1
        if current_week > 0:
            unlocked = min(unlocked, current_week)
        unlocked = max(1, unlocked)

        result.append({
            "course_id": cid,
            "course_code": c["code"],
            "course_title": c["title"],
            "max_done_week": max_done,
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
    level, semester = current_user["level"], current_user["semester"]
    qids = await _term_question_ids(level, semester)
    if not qids:
        return {
            "total_attempted": 0,
            "total_correct": 0,
            "accuracy": 0,
            "total_incorrect": 0,
        }
    base = {"user_id": current_user["id"], "question_id": {"$in": qids}}
    total = await attempts_col().count_documents(base)
    correct = await attempts_col().count_documents({**base, "is_correct": True})
    return {
        "total_attempted": total,
        "total_correct": correct,
        "accuracy": round(correct / total * 100, 1) if total else 0,
        "total_incorrect": total - correct,
    }


@router.post("/practice")
async def build_practice_feed(body: PracticeRequest, current_user: dict = Depends(get_current_user)):
    level = current_user["level"]
    semester = current_user["semester"]
    user_id = current_user["id"]

    if body.course_ids:
        selected_ids = [ObjectId(cid) for cid in body.course_ids if ObjectId.is_valid(cid)]
        selected_courses = await courses_col().find(
            {"_id": {"$in": selected_ids}, "is_active": True},
            {"_id": 1, "code": 1},
        ).to_list(None)
    else:
        selected_courses = await courses_col().find(
            {"level": level, "semester": semester, "is_active": True},
            {"_id": 1, "code": 1},
        ).to_list(None)

    if not selected_courses:
        return {"questions": [], "total": 0, "completed_count": 0, "progress_pct": 0, "is_custom": True}

    # fair distribution across selected courses
    size = len(selected_courses)
    base = body.count // size
    rem = body.count % size

    question_ids: list[str] = []
    for i, c in enumerate(selected_courses):
        cid = str(c["_id"])
        alloc = base + (1 if i < rem else 0)
        unlocked = await get_unlocked_week(user_id, cid)

        docs = await questions_col().aggregate([
            {"$match": {"course_id": cid, "week_number": {"$lte": unlocked}, "is_active": True}},
            {"$sample": {"size": alloc}},
        ]).to_list(None)
        question_ids.extend(str(d["_id"]) for d in docs)

    valid_oids = [ObjectId(x) for x in question_ids if ObjectId.is_valid(x)]
    qdocs = await questions_col().find({"_id": {"$in": valid_oids}}).to_list(None)
    qmap = {str(d["_id"]): d for d in qdocs}

    questions = []
    for qid in question_ids:
        q = qmap.get(qid)
        if not q:
            continue
        questions.append({
            "id": qid,
            "course_id": q.get("course_id"),
            "week_number": q.get("week_number"),
            "question_text": q.get("question_text"),
            "question_type": q.get("question_type", "mcq"),
            "options": q.get("options"),
            "difficulty": q.get("difficulty", "medium"),
            "topic": q.get("topic"),
            "is_completed": False,
            "correct_answer": None,
            "explanation": None,
        })

    return {
        "feed_date": date.today().isoformat(),
        "questions": questions,
        "total": len(questions),
        "completed_count": 0,
        "is_fully_completed": False,
        "progress_pct": 0,
        "is_custom": True,
        "requested_count": body.count,
        "selected_courses": [str(c["_id"]) for c in selected_courses],
    }


@router.get("/history")
async def progress_history(
    days: int = Query(default=14, ge=7, le=90),
    current_user: dict = Depends(get_current_user),
):
    uid = current_user["id"]
    level, semester = current_user["level"], current_user["semester"]
    qids = await _term_question_ids(level, semester)
    if not qids:
        return {"days": days, "history": []}
    today = date.today()
    start = today - timedelta(days=days - 1)

    dates = [(start + timedelta(days=i)).isoformat() for i in range(days)]
    history = []
    for d in dates:
        base = {"user_id": uid, "feed_date": d, "question_id": {"$in": qids}}
        total = await attempts_col().count_documents(base)
        correct = await attempts_col().count_documents({**base, "is_correct": True})
        history.append({
            "date": d,
            "attempted": total,
            "correct": correct,
            "incorrect": total - correct,
            "accuracy": round(correct / total * 100, 1) if total else 0,
        })

    return {"days": days, "history": history}


@router.get("/insights")
async def weak_links(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    level, semester = current_user["level"], current_user["semester"]
    current_courses = await courses_col().find(
        {"level": level, "semester": semester, "is_active": True},
        {"_id": 1, "code": 1, "title": 1},
    ).to_list(None)
    current_course_ids = {str(c["_id"]) for c in current_courses}
    if not current_course_ids:
        return {
            "weakest_week": None,
            "strongest_week": None,
            "streak": {
                "current": 0,
                "longest": 0,
                "missed_last_14_days": 14,
            },
        }
    qids = await questions_col().distinct("_id", {"course_id": {"$in": list(current_course_ids)}, "is_active": True})
    qid_strings = [str(qid) for qid in qids]
    if not qid_strings:
        return {
            "weakest_week": None,
            "strongest_week": None,
            "streak": {
                "current": 0,
                "longest": 0,
                "missed_last_14_days": 14,
            },
        }

    course_map = {
        str(c["_id"]): {"code": c["code"], "title": c["title"]}
        for c in current_courses
    }

    pipeline = [
        {"$match": {"user_id": uid, "question_id": {"$in": qid_strings}}},
        {"$lookup": {
            "from": "questions",
            "let": {"qid": "$question_id"},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$_id", {"$toObjectId": "$$qid"}]}}},
                {"$project": {"course_id": 1, "week_number": 1}},
            ],
            "as": "q",
        }},
        {"$unwind": "$q"},
        {"$group": {
            "_id": {"course_id": "$q.course_id", "week_number": "$q.week_number"},
            "total": {"$sum": 1},
            "correct": {"$sum": {"$cond": ["$is_correct", 1, 0]}},
        }},
    ]

    grouped = await attempts_col().aggregate(pipeline).to_list(None)

    if grouped:
        for g in grouped:
            g["accuracy"] = round((g["correct"] / g["total"]) * 100, 1) if g["total"] else 0
        weakest = min(grouped, key=lambda x: x["accuracy"])
        strongest = max(grouped, key=lambda x: x["accuracy"])

        def _map(entry: dict):
            cid = entry["_id"]["course_id"]
            info = course_map.get(cid, {"code": "COURSE", "title": "Unknown course"})
            return {
                "course_id": cid,
                "course_code": info["code"],
                "course_title": info["title"],
                "week_number": entry["_id"]["week_number"],
                "attempts": entry["total"],
                "correct": entry["correct"],
                "accuracy": entry["accuracy"],
            }

        weak_week = _map(weakest)
        strong_week = _map(strongest)
    else:
        weak_week = None
        strong_week = None

    # streaks from active attempt days
    day_docs = await attempts_col().aggregate([
        {"$match": {"user_id": uid, "question_id": {"$in": qid_strings}}},
        {"$group": {"_id": "$feed_date"}},
        {"$sort": {"_id": 1}},
    ]).to_list(None)

    active_days = [date.fromisoformat(d["_id"]) for d in day_docs if d.get("_id")]
    active_set = set(active_days)
    today = date.today()

    current_streak = 0
    cursor = today
    while cursor in active_set:
        current_streak += 1
        cursor -= timedelta(days=1)

    longest = 0
    running = 0
    prev = None
    for d in active_days:
        if prev and (d - prev).days == 1:
            running += 1
        else:
            running = 1
        longest = max(longest, running)
        prev = d

    last_14 = [today - timedelta(days=i) for i in range(14)]
    missed_days = sum(1 for d in last_14 if d not in active_set)

    return {
        "weakest_week": weak_week,
        "strongest_week": strong_week,
        "streak": {
            "current": current_streak,
            "longest": longest,
            "missed_last_14_days": missed_days,
        },
    }
