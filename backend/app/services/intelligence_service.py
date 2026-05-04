from __future__ import annotations

from datetime import datetime
import re
from typing import Any

from app.core.database import profiles_col, topics_col, formulas_col, notes_col


_FORMULA_HINTS = (
    "integral", "derivative", "matrix", "determinant", "probability", "variance",
    "standard deviation", "equation", "theorem", "solve", "calculate", "simplify",
)


def _normalize_topic(raw: str) -> str:
    return " ".join((raw or "").strip().split())


def _looks_formula(text: str) -> bool:
    t = (text or "").lower()
    symbol_pattern = r"[=+\-/*^()]|\b(sin|cos|tan|log|ln|sigma|sum)\b"
    return bool(re.search(symbol_pattern, t)) or any(k in t for k in _FORMULA_HINTS)


def infer_course_profile(course_title: str, topics: list[str], formulas: list[str], key_points: list[str]) -> dict[str, Any]:
    text_pool = " ".join([course_title, *topics, *formulas, *key_points]).lower()
    formula_hits = sum(1 for f in formulas if _looks_formula(f))
    formula_bias = formula_hits + sum(1 for k in _FORMULA_HINTS if k in text_pool)

    is_formula_heavy = formula_bias >= 3
    if is_formula_heavy:
        mix_targets = {"calculation": 50, "application": 30, "theory": 20}
        explanation_mode = "step_by_step"
    else:
        mix_targets = {"calculation": 20, "application": 45, "theory": 35}
        explanation_mode = "exam_style"

    return {
        "is_formula_heavy": is_formula_heavy,
        "mix_targets": mix_targets,
        "difficulty_targets": {"easy": 30, "medium": 50, "hard": 20},
        "explanation_mode": explanation_mode,
        "updated_at": datetime.utcnow(),
    }


async def upsert_course_intelligence(
    course_id: str,
    course_title: str,
    topics: list[str],
    key_formulas: list[str],
    key_points: list[str],
    summary: str,
) -> None:
    normalized_topics = [_normalize_topic(t) for t in topics if _normalize_topic(t)]
    normalized_formulas = [_normalize_topic(f) for f in key_formulas if _normalize_topic(f)]

    profile = infer_course_profile(course_title, normalized_topics, normalized_formulas, key_points)
    await profiles_col().update_one(
        {"course_id": course_id},
        {"$set": {"course_id": course_id, **profile}, "$setOnInsert": {"created_at": datetime.utcnow()}},
        upsert=True,
    )

    for topic in normalized_topics:
        await topics_col().update_one(
            {"course_id": course_id, "topic": topic, "subtopic": topic},
            {"$set": {
                "course_id": course_id,
                "topic": topic,
                "subtopic": topic,
                "learning_outcome": f"Understand and apply {topic} in exam contexts.",
                "importance_weight": 1.0,
                "source": "pdf",
                "updated_at": datetime.utcnow(),
            }, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )

    for formula in normalized_formulas:
        await formulas_col().update_one(
            {"course_id": course_id, "formula_name": formula},
            {"$set": {
                "course_id": course_id,
                "formula_name": formula,
                "expression": formula,
                "variables": [],
                "units": [],
                "conditions": "",
                "common_mistakes": [],
                "worked_example": "",
                "updated_at": datetime.utcnow(),
            }, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )

    if normalized_topics:
        await notes_col().update_one(
            {"course_id": course_id, "topic": normalized_topics[0]},
            {"$set": {
                "course_id": course_id,
                "topic": normalized_topics[0],
                "title": f"Deep dive: {normalized_topics[0]}",
                "note": summary or f"{normalized_topics[0]} is central to this course.",
                "references": key_points[:5],
                "updated_at": datetime.utcnow(),
            }, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )
