from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from bson import ObjectId

from app.core.database import cycles_col, courses_col, pdfs_col, questions_col, attempts_col
from app.services.ai_service import generate_study_cycle

logger = logging.getLogger(__name__)


async def refresh_study_cycle_for_term(level: str, semester: int) -> list[dict[str, Any]]:
    courses = await courses_col().find(
        {"level": level, "semester": semester, "is_active": True},
        {"_id": 1, "code": 1, "title": 1, "credit_units": 1},
    ).to_list(None)

    await cycles_col().delete_many({"level": level, "semester": semester})
    if not courses:
        return []

    docs = await generate_study_cycle(level, semester, courses)
    if not docs:
        logger.info("No study cycle generated for %s semester %s", level, semester)
        return []

    payload = [
        {
            "level": level,
            "semester": semester,
            "day_number": day.get("day_number"),
            "course_ids": day.get("course_ids", []),
            "is_auto_generated": True,
            "updated_at": datetime.utcnow(),
        }
        for day in docs
        if day.get("day_number")
    ]

    if payload:
        await cycles_col().insert_many(payload)
    return payload


async def _course_ranking(level: str, semester: int) -> dict[str, dict[str, Any]]:
    courses = await courses_col().find(
        {"level": level, "semester": semester, "is_active": True},
        {"_id": 1, "code": 1, "title": 1, "credit_units": 1},
    ).to_list(None)
    if not courses:
        return {}

    course_ids = [str(course["_id"]) for course in courses]
    question_ids = await questions_col().distinct(
        "_id",
        {"course_id": {"$in": course_ids}, "is_active": True},
    )
    question_id_strings = [str(qid) for qid in question_ids]

    pdf_counts = {
        row["_id"]: row["count"]
        for row in await pdfs_col().aggregate([
            {"$match": {"course_id": {"$in": course_ids}, "is_deleted": {"$ne": True}}},
            {"$group": {"_id": "$course_id", "count": {"$sum": 1}}},
        ]).to_list(None)
    }
    question_counts = {
        row["_id"]: row["count"]
        for row in await questions_col().aggregate([
            {"$match": {"course_id": {"$in": course_ids}, "is_active": True}},
            {"$group": {"_id": "$course_id", "count": {"$sum": 1}}},
        ]).to_list(None)
    }

    course_week_stats: dict[tuple[str, int], dict[str, int]] = {}
    if question_id_strings:
        grouped = await attempts_col().aggregate([
            {"$match": {"question_id": {"$in": question_id_strings}}},
            {
                "$lookup": {
                    "from": "questions",
                    "let": {"qid": "$question_id"},
                    "pipeline": [
                        {"$match": {"$expr": {"$eq": ["$_id", {"$toObjectId": "$$qid"}]}}},
                        {"$project": {"course_id": 1, "week_number": 1}},
                    ],
                    "as": "q",
                }
            },
            {"$unwind": "$q"},
            {
                "$group": {
                    "_id": {"course_id": "$q.course_id", "week_number": "$q.week_number"},
                    "total": {"$sum": 1},
                    "correct": {"$sum": {"$cond": ["$is_correct", 1, 0]}},
                }
            },
        ]).to_list(None)
        for entry in grouped:
            cid = entry["_id"]["course_id"]
            week = int(entry["_id"].get("week_number") or 0)
            total = int(entry.get("total", 0))
            correct = int(entry.get("correct", 0))
            stats = course_week_stats.setdefault((cid, week), {"total": 0, "correct": 0})
            stats["total"] += total
            stats["correct"] += correct

    ranking: dict[str, dict[str, Any]] = {}
    for course in courses:
        cid = str(course["_id"])
        q_count = int(question_counts.get(cid, 0))
        p_count = int(pdf_counts.get(cid, 0))

        week_entries = [stats for (course_id, _week), stats in course_week_stats.items() if course_id == cid]
        total_attempts = sum(entry["total"] for entry in week_entries)
        total_correct = sum(entry["correct"] for entry in week_entries)
        overall_accuracy = round((total_correct / total_attempts) * 100, 1) if total_attempts else 0.0
        weakest_week_accuracy = min(
            [round((entry["correct"] / entry["total"]) * 100, 1) for entry in week_entries if entry["total"]],
            default=0.0,
        )

        volume_score = (q_count * 2.0) + (p_count * 0.75)
        accuracy_score = ((100.0 - overall_accuracy) / 10.0) if total_attempts else 0.0
        weakness_score = ((100.0 - weakest_week_accuracy) / 12.0) if week_entries else 0.0
        attempt_score = min(total_attempts, 100) / 50.0
        score = round(volume_score + accuracy_score + weakness_score + attempt_score, 3)

        ranking[cid] = {
            "score": score,
            "question_count": q_count,
            "pdf_count": p_count,
            "attempt_count": total_attempts,
            "accuracy": overall_accuracy,
            "weakest_week_accuracy": weakest_week_accuracy,
        }

    return ranking


async def hydrate_ranked_cycle_docs(docs: list[dict[str, Any]], level: str, semester: int) -> list[dict[str, Any]]:
    ranking = await _course_ranking(level, semester)
    courses_map: dict[str, dict[str, Any]] = {}
    for cid in {cid for doc in docs for cid in doc.get("course_ids", [])}:
        if ObjectId.is_valid(cid):
            course = await courses_col().find_one({"_id": ObjectId(cid)})
            if course:
                courses_map[cid] = {"id": cid, "code": course["code"], "title": course["title"]}

    hydrated: list[dict[str, Any]] = []
    for doc in docs:
        ordered_course_ids = [
            cid
            for cid in sorted(
                [cid for cid in doc.get("course_ids", []) if cid in courses_map],
                key=lambda cid: (
                    -ranking.get(cid, {}).get("score", 0.0),
                    ranking.get(cid, {}).get("question_count", 0) * -1,
                    ranking.get(cid, {}).get("pdf_count", 0) * -1,
                    courses_map[cid]["code"],
                ),
            )
        ]
        hydrated.append(
            {
                "day_number": doc["day_number"],
                "courses": [courses_map[cid] for cid in ordered_course_ids],
                "is_auto_generated": doc.get("is_auto_generated", False),
            }
        )

    return sorted(hydrated, key=lambda item: item["day_number"])


async def get_ranked_study_cycle_for_term(level: str, semester: int) -> list[dict[str, Any]]:
    docs = await cycles_col().find({"level": level, "semester": semester}).sort("day_number", 1).to_list(None)
    if not docs:
        docs = await refresh_study_cycle_for_term(level, semester)
        docs = sorted(docs, key=lambda x: x["day_number"])
    return await hydrate_ranked_cycle_docs(docs, level, semester)