from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from app.core.database import cycles_col, courses_col
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