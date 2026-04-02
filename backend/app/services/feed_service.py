"""
Feed Service — Progress Gate logic, daily 60-question feed (MongoDB version).

Progress Gate Rule:
  User's unlocked week per course = highest week marked done (default 1).
  Questions from week > unlocked_week are NEVER shown in the feed.
"""
from datetime import date, timedelta
from typing import Optional
import random
import logging
from bson import ObjectId

from app.core.database import (
    questions_col, progress_col, feeds_col,
    exams_col, calendars_col, courses_col, attempts_col,
)

logger = logging.getLogger(__name__)
FEED_SIZE = 60


# ── Academic Week ──────────────────────────────────────────────────────────

def _academic_week(lectures_start_str: Optional[str]) -> int:
    if not lectures_start_str:
        return 1
    start = date.fromisoformat(lectures_start_str)
    today = date.today()
    if today < start:
        return 0
    return (today - start).days // 7 + 1


async def get_active_calendar(level: str, semester: int) -> Optional[dict]:
    return await calendars_col().find_one({"level": level, "semester": semester, "is_active": True})


# ── Progress Gate ──────────────────────────────────────────────────────────

async def get_unlocked_week(user_id: str, course_id: str) -> int:
    cursor = progress_col().find(
        {"user_id": user_id, "course_id": course_id, "is_done": True},
        {"week_number": 1},
    ).sort("week_number", -1).limit(1)
    doc = await cursor.to_list(1)
    return doc[0]["week_number"] if doc else 1


# ── Exam-mode helpers ──────────────────────────────────────────────────────

async def _exam_course_ids(level: str, semester: int, days_ahead: int = 3) -> set[str]:
    today = date.today()
    future = today + timedelta(days=days_ahead)
    cursor = exams_col().find(
        {"level": level, "semester": semester,
         "exam_date": {"$gte": today.isoformat(), "$lte": future.isoformat()}},
        {"course_id": 1},
    )
    return {d["course_id"] async for d in cursor}

async def _today_exam_ids(level: str, semester: int) -> set[str]:
    today_str = date.today().isoformat()
    cursor = exams_col().find(
        {"level": level, "semester": semester, "exam_date": today_str},
        {"course_id": 1},
    )
    return {d["course_id"] async for d in cursor}


# ── Generate question IDs for a feed ──────────────────────────────────────

async def _build_question_ids(user: dict, exclude: list[str], target: int) -> list[str]:
    level, semester = user["level"], user["semester"]
    user_id = user["id"]

    courses = await courses_col().find(
        {"level": level, "semester": semester, "is_active": True}, {"_id": 1}
    ).to_list(None)
    if not courses:
        return []

    upcoming_exam_ids = await _exam_course_ids(level, semester, days_ahead=3)
    today_exam_ids    = await _today_exam_ids(level, semester)

    count = len(courses)
    base  = target // count
    rem   = target % count

    all_ids: list[str] = []

    for i, course in enumerate(courses):
        cid = str(course["_id"])
        alloc = base + (1 if i < rem else 0)
        if cid in today_exam_ids:
            alloc = min(alloc * 2, 15)
        elif cid in upcoming_exam_ids:
            alloc = min(alloc + 3, 12)

        unlocked = await get_unlocked_week(user_id, cid)
        skip_ids = exclude + all_ids

        pipeline = [
            {"$match": {
                "course_id": cid,
                "week_number": {"$lte": unlocked},
                "is_active": True,
                **({"_id": {"$nin": [ObjectId(x) for x in skip_ids if ObjectId.is_valid(x)]}} if skip_ids else {}),
            }},
            {"$sample": {"size": alloc}},
            {"$project": {"_id": 1}},
        ]
        docs = await questions_col().aggregate(pipeline).to_list(None)
        all_ids.extend(str(d["_id"]) for d in docs)

    random.shuffle(all_ids)
    return all_ids[:target]


# ── Daily Feed ─────────────────────────────────────────────────────────────

async def get_or_create_daily_feed(user: dict) -> dict:
    today_str = date.today().isoformat()
    user_id   = user["id"]
    col       = feeds_col()

    existing = await col.find_one({"user_id": user_id, "feed_date": today_str})

    if existing and not existing.get("is_fully_completed"):
        return await _feed_response(existing, user_id)

    # Carry-over: if yesterday's feed was incomplete, keep unanswered questions
    yesterday_str = (date.today() - timedelta(days=1)).isoformat()
    yesterday = await col.find_one(
        {"user_id": user_id, "feed_date": yesterday_str, "is_fully_completed": False}
    )

    carry: list[str] = []
    if yesterday and not existing:
        done_set = set(yesterday.get("completed_ids", []))
        carry = [qid for qid in yesterday.get("question_ids", []) if qid not in done_set]

    new_ids = await _build_question_ids(user, exclude=carry, target=max(0, FEED_SIZE - len(carry)))
    question_ids = carry + new_ids

    if existing:
        await col.update_one(
            {"_id": existing["_id"]},
            {"$set": {"question_ids": question_ids, "completed_ids": [], "is_fully_completed": False}},
        )
        existing["question_ids"]   = question_ids
        existing["completed_ids"]  = []
        existing["is_fully_completed"] = False
        feed = existing
    else:
        doc = {
            "user_id": user_id,
            "feed_date": today_str,
            "question_ids": question_ids,
            "completed_ids": [],
            "is_fully_completed": False,
        }
        result = await col.insert_one(doc)
        feed = await col.find_one({"_id": result.inserted_id})

    return await _feed_response(feed, user_id)


async def _feed_response(feed: dict, user_id: str) -> dict:
    qids = feed.get("question_ids", [])
    completed = set(feed.get("completed_ids", []))

    # Fetch questions preserving order
    valid_oids = [ObjectId(x) for x in qids if ObjectId.is_valid(x)]
    docs = await questions_col().find({"_id": {"$in": valid_oids}}).to_list(None)
    qmap = {str(d["_id"]): d for d in docs}

    questions = []
    for qid in qids:
        q = qmap.get(qid)
        if not q:
            continue
        is_done = qid in completed
        questions.append({
            "id": qid,
            "course_id": q.get("course_id"),
            "week_number": q.get("week_number"),
            "question_text": q.get("question_text"),
            "question_type": q.get("question_type", "mcq"),
            "options": q.get("options"),
            "difficulty": q.get("difficulty", "medium"),
            "topic": q.get("topic"),
            "is_completed": is_done,
            "correct_answer": q.get("correct_answer") if is_done else None,
            "explanation": q.get("explanation") if is_done else None,
        })

    total = len(questions)
    done_count = len(completed & set(qids))
    return {
        "feed_date": feed["feed_date"],
        "questions": questions,
        "total": total,
        "completed_count": done_count,
        "is_fully_completed": feed.get("is_fully_completed", False),
        "progress_pct": round(done_count / total * 100, 1) if total else 0,
    }


# ── Submit Answer ──────────────────────────────────────────────────────────

async def submit_answer(user_id: str, question_id: str, selected: str) -> dict:
    if not ObjectId.is_valid(question_id):
        raise ValueError("Invalid question id")

    q = await questions_col().find_one({"_id": ObjectId(question_id)})
    if not q:
        raise ValueError("Question not found")

    is_correct = selected.upper() == q["correct_answer"].upper()
    today_str  = date.today().isoformat()

    await attempts_col().insert_one({
        "user_id": user_id,
        "question_id": question_id,
        "selected_answer": selected.upper(),
        "is_correct": is_correct,
        "feed_date": today_str,
    })

    # Update feed completion
    feed = await feeds_col().find_one({"user_id": user_id, "feed_date": today_str})
    if feed:
        completed = list(feed.get("completed_ids", []))
        if question_id not in completed:
            completed.append(question_id)
            fully = len(completed) >= len(feed.get("question_ids", []))
            await feeds_col().update_one(
                {"_id": feed["_id"]},
                {"$set": {"completed_ids": completed, "is_fully_completed": fully}},
            )

    return {
        "is_correct": is_correct,
        "correct_answer": q["correct_answer"],
        "explanation": q.get("explanation", ""),
        "question_id": question_id,
    }
