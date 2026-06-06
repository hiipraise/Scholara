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
    exams_col, calendars_col, courses_col, attempts_col, profiles_col,
)
from app.core.database import question_flags_col

logger = logging.getLogger(__name__)
FEED_SIZE = 60


# ── Academic Week ──────────────────────────────────────────────────────────

def _parse_iso(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _academic_week(lectures_start_str: Optional[str], semester_end_str: Optional[str] = None) -> int:
    if not lectures_start_str:
        return 1
    start = _parse_iso(lectures_start_str)
    if not start:
        return 1
    today = date.today()
    if today < start:
        # Keep week display/use at minimum week 1 to avoid a "stuck at 0" UX.
        return 1
    end = _parse_iso(semester_end_str)
    effective_day = min(today, end) if end else today
    return (effective_day - start).days // 7 + 1


async def get_active_calendar(level: str, semester: int) -> Optional[dict]:
    calendar = await calendars_col().find_one({"level": level, "semester": semester, "is_active": True})
    if not calendar:
        return None

    end = _parse_iso(calendar.get("semester_end_date"))
    if end and date.today() > end:
        await calendars_col().update_one(
            {"_id": calendar["_id"]},
            {"$set": {"is_active": False}},
        )
        return None
    return calendar


# ── Progress Gate ──────────────────────────────────────────────────────────

async def get_unlocked_week(user_id: str, course_id: str) -> int:
    cursor = progress_col().find(
        {"user_id": user_id, "course_id": course_id, "is_done": True},
        {"week_number": 1},
    ).sort("week_number", -1).limit(1)
    doc = await cursor.to_list(1)
    # Unlock the next academic week after the highest completed week.
    return (doc[0]["week_number"] + 1) if doc else 1


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

def _style_allocations(alloc: int, mix_targets: dict) -> dict[str, int]:
    if alloc <= 0:
        return {"calculation": 0, "application": 0, "theory": 0}
    calc_pct = int(mix_targets.get("calculation", 25))
    app_pct = int(mix_targets.get("application", 40))
    theory_pct = int(mix_targets.get("theory", 35))
    total_pct = max(1, calc_pct + app_pct + theory_pct)
    base = {
        "calculation": int(alloc * calc_pct / total_pct),
        "application": int(alloc * app_pct / total_pct),
        "theory": int(alloc * theory_pct / total_pct),
    }
    remainder = alloc - sum(base.values())
    order = sorted(base.keys(), key=lambda k: mix_targets.get(k, 0), reverse=True)
    for i in range(remainder):
        base[order[i % len(order)]] += 1
    return base


async def _sample_for_course(
    cid: str,
    unlocked: int,
    alloc: int,
    skip_ids: list[str],
) -> list[str]:
    if alloc <= 0:
        return []

    profile = await profiles_col().find_one({"course_id": cid}) or {}
    mix_targets = profile.get("mix_targets") or {"calculation": 25, "application": 40, "theory": 35}
    by_style = _style_allocations(alloc, mix_targets)
    picked: list[str] = []
    blocked_ids = list(skip_ids)

    async def _pull(style: Optional[str], size: int):
        nonlocal blocked_ids, picked
        if size <= 0:
            return
        match = {
            "course_id": cid,
            "week_number": {"$lte": unlocked},
            "is_active": True,
            **({"question_style": style} if style else {}),
            **({"_id": {"$nin": [ObjectId(x) for x in blocked_ids if ObjectId.is_valid(x)]}} if blocked_ids else {}),
        }
        docs = await questions_col().aggregate([
            {"$match": match},
            {"$sample": {"size": size}},
            {"$project": {"_id": 1}},
        ]).to_list(None)
        new_ids = [str(d["_id"]) for d in docs]
        picked.extend(new_ids)
        blocked_ids.extend(new_ids)

    await _pull("calculation", by_style["calculation"])
    await _pull("application", by_style["application"])
    await _pull("theory", by_style["theory"])

    # Backfill any shortage from any style for resilience.
    remaining = alloc - len(picked)
    if remaining > 0:
        await _pull(None, remaining)
    return picked[:alloc]


async def _build_question_ids(user: dict, exclude: list[str], target: int) -> list[str]:
    level, semester = user["level"], user["semester"]
    user_id = user["id"]
    active_calendar = await get_active_calendar(level, semester)
    if not active_calendar:
        logger.info("No active calendar for %s semester %s", level, semester)
        return []

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
        all_ids.extend(await _sample_for_course(cid, unlocked, alloc, skip_ids))

    random.shuffle(all_ids)
    return all_ids[:target]


# ── Daily Feed ─────────────────────────────────────────────────────────────

async def get_or_create_daily_feed(user: dict) -> dict:
    today_str = date.today().isoformat()
    user_id   = user["id"]
    level     = user["level"]
    semester  = user["semester"]
    col       = feeds_col()

    existing = await col.find_one({
        "user_id": user_id,
        "feed_date": today_str,
        "level": level,
        "semester": semester,
    })

    # Backward compatibility with old unique index (user_id + feed_date):
    # older feed docs may not have level/semester, and only one feed can exist per day.
    if not existing:
        existing = await col.find_one({"user_id": user_id, "feed_date": today_str})

    if existing:
        if existing.get("level") != level or existing.get("semester") != semester:
            await col.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "level": level,
                    "semester": semester,
                    "question_ids": [],
                    "completed_ids": [],
                    "is_fully_completed": False,
                    "batch_number": 1,
                }},
            )
            existing["level"] = level
            existing["semester"] = semester
            existing["question_ids"] = []
            existing["completed_ids"] = []
            existing["is_fully_completed"] = False
            existing["batch_number"] = 1
        return await _feed_response(existing, user_id)

    # Carry-over: if yesterday's feed was incomplete, keep unanswered questions
    yesterday_str = (date.today() - timedelta(days=1)).isoformat()
    yesterday = await col.find_one({
        "user_id": user_id,
        "feed_date": yesterday_str,
        "is_fully_completed": False,
        "level": level,
        "semester": semester,
    })

    carry: list[str] = []
    if yesterday and not existing:
        done_set = set(yesterday.get("completed_ids", []))
        carry = [qid for qid in yesterday.get("question_ids", []) if qid not in done_set]

    new_ids = await _build_question_ids(user, exclude=carry, target=max(0, FEED_SIZE - len(carry)))
    question_ids = carry + new_ids

    doc = {
        "user_id": user_id,
        "feed_date": today_str,
        "level": level,
        "semester": semester,
        "question_ids": question_ids,
        "completed_ids": [],
        "is_fully_completed": False,
        "batch_number": 1,
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
        # Skip questions the user has flagged (open status)
        flagged = await question_flags_col().find_one({"user_id": user_id, "question_id": qid, "status": "open"})
        if flagged:
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
            "question_style": q.get("question_style", "application"),
            "depth_level": q.get("depth_level", "apply"),
            "is_completed": is_done,
            "correct_answer": q.get("correct_answer") if is_done else None,
            "explanation": q.get("explanation") if is_done else None,
            "solution_steps": q.get("solution_steps") if is_done else [],
        })

    total = len(questions)
    done_count = len(completed & set(qids))
    return {
        "feed_date": feed["feed_date"],
        "questions": questions,
        "total": total,
        "completed_count": min(done_count, total),
        "is_fully_completed": feed.get("is_fully_completed", False),
        "progress_pct": round(min(done_count, total) / total * 100, 1) if total else 0,
        "batch_number": feed.get("batch_number", 1),
        "can_refresh": feed.get("is_fully_completed", False),
    }


async def refresh_daily_feed(user: dict) -> dict:
    """Replace a completed daily feed with the next 60-question batch on demand."""
    today_str = date.today().isoformat()
    user_id = user["id"]
    level = user["level"]
    semester = user["semester"]
    col = feeds_col()

    existing = await col.find_one({"user_id": user_id, "feed_date": today_str})
    if existing and not existing.get("is_fully_completed"):
        return await _feed_response(existing, user_id)

    exclude = existing.get("question_ids", []) if existing else []
    question_ids = await _build_question_ids(user, exclude=exclude, target=FEED_SIZE)
    if len(question_ids) < FEED_SIZE:
        # If the available bank cannot provide 60 unseen questions, backfill from the
        # same unlocked pool so the next-batch action still keeps the feed usable.
        backfill = await _build_question_ids(
            user,
            exclude=question_ids,
            target=FEED_SIZE - len(question_ids),
        )
        question_ids.extend(backfill)
    doc_updates = {
        "level": level,
        "semester": semester,
        "question_ids": question_ids,
        "completed_ids": [],
        "is_fully_completed": False,
        "batch_number": (existing or {}).get("batch_number", 0) + 1,
    }

    if existing:
        await col.update_one({"_id": existing["_id"]}, {"$set": doc_updates})
        existing.update(doc_updates)
        feed = existing
    else:
        doc = {"user_id": user_id, "feed_date": today_str, **doc_updates}
        result = await col.insert_one(doc)
        feed = await col.find_one({"_id": result.inserted_id})

    return await _feed_response(feed, user_id)


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
        total = len(feed.get("question_ids", []))
        completed_count = len(completed)
        feed_completed = completed_count >= total if total else False
    else:
        total = 0
        completed_count = 0
        feed_completed = False

    return {
        "is_correct": is_correct,
        "correct_answer": q["correct_answer"],
        "explanation": q.get("explanation", ""),
        "question_id": question_id,
        "feed_completed": feed_completed,
        "completed_count": completed_count,
        "total": total,
    }
