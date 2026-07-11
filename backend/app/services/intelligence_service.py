from __future__ import annotations

from datetime import datetime
import html as html_lib
import logging
import re
from urllib.parse import parse_qs, unquote, urlparse
from typing import Any

import httpx

from app.core.database import profiles_col, topics_col, formulas_col, notes_col


_FORMULA_HINTS = (
    "integral", "derivative", "matrix", "determinant", "probability", "variance",
    "standard deviation", "equation", "theorem", "solve", "calculate", "simplify",
)

_DDG_URL = "https://html.duckduckgo.com/html/"


def _normalize_topic(raw: str) -> str:
    return " ".join((raw or "").strip().split())


def _looks_formula(text: str) -> bool:
    t = (text or "").lower()
    symbol_pattern = r"[=+\-/*^()]|\b(sin|cos|tan|log|ln|sigma|sum)\b"
    return bool(re.search(symbol_pattern, t)) or any(k in t for k in _FORMULA_HINTS)


def _normalize_formula_cards(raw_cards: list[dict[str, Any]] | None, fallback_formulas: list[str]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []

    for card in raw_cards or []:
        formula_name = _normalize_topic(str(card.get("formula_name", "")))
        expression = _normalize_topic(str(card.get("expression", "")))
        if not formula_name and not expression:
            continue
        if not formula_name:
            formula_name = expression[:48] if len(expression) > 48 else expression
        if not expression:
            expression = formula_name

        cards.append({
            "formula_name": formula_name,
            "expression": expression,
            "variables": [str(v).strip() for v in card.get("variables", []) if str(v).strip()],
            "units": [str(u).strip() for u in card.get("units", []) if str(u).strip()],
            "conditions": str(card.get("conditions", "")).strip(),
            "common_mistakes": [str(m).strip() for m in card.get("common_mistakes", []) if str(m).strip()],
            "worked_example": str(card.get("worked_example", "")).strip(),
        })

    if cards:
        return cards

    for formula in fallback_formulas:
        normalized = _normalize_topic(formula)
        if normalized:
            cards.append({
                "formula_name": normalized,
                "expression": normalized,
                "variables": [],
                "units": [],
                "conditions": "",
                "common_mistakes": [],
                "worked_example": "",
            })
    return cards


def _merge_profile_data(profile_data: dict[str, Any] | None, fallback_profile: dict[str, Any]) -> dict[str, Any]:
    if not profile_data:
        return fallback_profile

    merged = dict(fallback_profile)
    merged.update({k: v for k, v in profile_data.items() if v is not None})
    merged.setdefault("is_formula_heavy", fallback_profile.get("is_formula_heavy", False))
    merged.setdefault("mix_targets", fallback_profile.get("mix_targets", {"calculation": 25, "application": 40, "theory": 35}))
    merged.setdefault("difficulty_targets", fallback_profile.get("difficulty_targets", {"easy": 30, "medium": 50, "hard": 20}))
    merged.setdefault("explanation_mode", fallback_profile.get("explanation_mode", "exam_style"))
    return merged


def _clean_html_text(text: str) -> str:
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()


def _normalize_duckduckgo_url(url: str) -> str:
    if not url:
        return ""
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if "uddg" in query and query["uddg"]:
        return unquote(query["uddg"][0])
    return url


# Public alias for cross-module use (e.g. lesson_service.py)
async def duckduckgo_search(query: str, limit: int = 3) -> list[dict[str, str]]:
    return await _duckduckgo_search(query, limit)


async def _duckduckgo_search(query: str, limit: int = 3) -> list[dict[str, str]]:
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    async with httpx.AsyncClient(timeout=20, headers=headers, follow_redirects=True) as client:
        response = await client.get(_DDG_URL, params={"q": query})
        response.raise_for_status()

    html = response.text
    matches = list(re.finditer(r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.S))
    results: list[dict[str, str]] = []

    for match in matches[:limit]:
        raw_url = html_lib.unescape(match.group(1))
        title = _clean_html_text(match.group(2))
        window = html[match.end(): match.end() + 1200]
        snippet_match = re.search(r'<(?:a|div)[^>]*class="result__snippet"[^>]*>(.*?)</(?:a|div)>', window, re.S)
        snippet = _clean_html_text(snippet_match.group(1)) if snippet_match else ""
        results.append({
            "title": title,
            "url": _normalize_duckduckgo_url(raw_url),
            "snippet": snippet,
        })

    return results


async def build_deep_dive_notes(
    course_title: str,
    topics: list[str],
    key_points: list[str],
    limit: int = 3,
) -> list[dict[str, Any]]:
    anchors = [topic for topic in topics if topic][:limit]
    if not anchors:
        anchors = [course_title]

    notes: list[dict[str, Any]] = []
    for anchor in anchors:
        query = f'{course_title} {anchor}'
        try:
            refs = await _duckduckgo_search(query, limit=3)
        except Exception:
            refs = []

        if refs:
            summary_lines = []
            for ref in refs[:2]:
                snippet = ref.get("snippet")
                if snippet:
                    summary_lines.append(f'{ref.get("title", "Source")}: {snippet}')
                else:
                    summary_lines.append(ref.get("title", "Source"))
            note_text = (
                f"{anchor} in {course_title} is reinforced by public web references. "
                f"{(' '.join(summary_lines)).strip()}"
            )
            references = [f'{ref.get("title", "Source")} | {ref.get("url", "")}' for ref in refs if ref.get("url")]
        else:
            note_text = (
                f"{anchor} in {course_title} needs a quick cross-check against lecture material and online references. "
                f"Focus on {key_points[0] if key_points else 'the core definition'} and the worked examples from the course notes."
            )
            references = []

        notes.append({
            "topic": anchor,
            "title": f"Deep dive: {anchor}",
            "note": note_text,
            "references": references,
        })

    return notes


def infer_course_profile(course_title: str, topics: list[str], formulas: list[str], key_points: list[str]) -> dict[str, Any]:
    text_pool = " ".join([course_title, *topics, *formulas, *key_points]).lower()
    formula_hits = sum(1 for f in formulas if _looks_formula(f))
    intensity = min(1.0, (formula_hits + sum(1 for k in _FORMULA_HINTS if k in text_pool)) / 6.0)
    theory_weight = max(0.2, 0.45 - intensity * 0.15)
    application_weight = max(0.25, 0.35 + intensity * 0.05)
    calculation_weight = max(0.2, 1.0 - theory_weight - application_weight)
    total = calculation_weight + application_weight + theory_weight
    mix_targets = {
        "calculation": round(calculation_weight / total * 100),
        "application": round(application_weight / total * 100),
        "theory": round(theory_weight / total * 100),
    }
    diff_balance = max(0.0, 1.0 - intensity * 0.4)

    if intensity >= 0.6:
        focus_label = "calculation-heavy"
        explanation_mode = "step_by_step"
    elif intensity >= 0.35:
        focus_label = "balanced"
        explanation_mode = "step_by_step"
    else:
        focus_label = "theory-heavy"
        explanation_mode = "exam_style"

    return {
        "focus_label": focus_label,
        "summary": (
            f"{course_title} leans toward {focus_label.replace('-', ' ')} revision with emphasis on "
            f"{('problem solving' if intensity >= 0.6 else 'concept retention' if intensity < 0.35 else 'applied understanding')}."
        ),
        "is_formula_heavy": intensity >= 0.6,
        "mix_targets": mix_targets,
        "difficulty_targets": {
            "easy": round(25 + diff_balance * 10),
            "medium": round(45 + (1.0 - diff_balance) * 10),
            "hard": round(30 - (1.0 - diff_balance) * 10),
        },
        "explanation_mode": explanation_mode,
        "revision_priority": key_points[0] if key_points else (topics[0] if topics else course_title),
        "study_tip": (
            "Work from the lecture summary to the examples, then revisit the flagged formulas."
            if intensity >= 0.35
            else "Focus on definitions and short answer practice before revisiting examples."
        ),
        "updated_at": datetime.utcnow(),
    }


async def upsert_course_intelligence(
    course_id: str,
    course_title: str,
    topics: list[str],
    key_formulas: list[str],
    key_points: list[str],
    summary: str,
    formula_cards: list[dict[str, Any]] | None = None,
    profile_data: dict[str, Any] | None = None,
) -> None:
    normalized_topics = [_normalize_topic(t) for t in topics if _normalize_topic(t)]
    normalized_formulas = [_normalize_topic(f) for f in key_formulas if _normalize_topic(f)]
    normalized_cards = _normalize_formula_cards(formula_cards, normalized_formulas)

    profile = _merge_profile_data(profile_data, infer_course_profile(course_title, normalized_topics, normalized_formulas, key_points))
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

    for formula in normalized_cards:
        await formulas_col().update_one(
            {"course_id": course_id, "formula_name": formula["formula_name"]},
            {"$set": {
                "course_id": course_id,
                "formula_name": formula["formula_name"],
                "expression": formula["expression"],
                "variables": formula["variables"],
                "units": formula["units"],
                "conditions": formula["conditions"],
                "common_mistakes": formula["common_mistakes"],
                "worked_example": formula["worked_example"],
                "updated_at": datetime.utcnow(),
            }, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )

    deep_dive_notes = await build_deep_dive_notes(course_title, normalized_topics, key_points)
    if not deep_dive_notes and normalized_topics:
        deep_dive_notes = [{
            "topic": normalized_topics[0],
            "title": f"Deep dive: {normalized_topics[0]}",
            "note": summary or f"{normalized_topics[0]} is central to this course.",
            "references": key_points[:5],
        }]

    for note in deep_dive_notes:
        await notes_col().update_one(
            {"course_id": course_id, "topic": note["topic"]},
            {"$set": {
                "course_id": course_id,
                "topic": note["topic"],
                "title": note["title"],
                "note": note["note"],
                "references": note.get("references", []),
                "updated_at": datetime.utcnow(),
            }, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )
