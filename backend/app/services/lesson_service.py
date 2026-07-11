"""
Lesson Service — "Teach Me" per-week lesson generation + chat tutor.

Generates a structured lesson for a given course + week using the uploaded
PDF text and supplementary web references. Lessons are cached indefinitely
in the course_lessons collection (admin-only regeneration).
"""
import json
import logging
from typing import Any

from app.services.ai_service import call_ai, clean_json, _mock_questions_allowed
from app.services.intelligence_service import duckduckgo_search

logger = logging.getLogger(__name__)

# ── Prompts ────────────────────────────────────────────────────────────────

LESSON_SYSTEM = (
    "You are Nexus Core, an expert lecturer teaching a 100-level Nigerian "
    "software engineering student. You are not summarizing — you are TEACHING: "
    "explain concepts the way a great lecturer would, with intuition, "
    "worked examples, and plain-language analogies. Ground your teaching "
    "primarily in the provided lecture content, but where the lecture is "
    "thin or assumes background the student may not have, use the "
    "supplementary web references to fill gaps and give richer examples — "
    "clearly this is still teaching the same topic, not a tangent. "
    "Respond ONLY with valid JSON, no markdown, no preamble."
)

LESSON_PROMPT = """\
COURSE: {course_code} — {course_title}
WEEK: {week_number}

LECTURE CONTENT (primary source, extracted from the uploaded PDF):
{lecture_text}

SUPPLEMENTARY WEB REFERENCES (use to deepen/extend explanations where helpful,
do not contradict the lecture content):
{web_context}

Return JSON matching exactly:
{{
  "overview": "<2-3 sentence framing of what this week covers and why it matters>",
  "sections": [
    {{
      "title": "<topic/subtopic name>",
      "explanation": "<thorough, plain-language teaching explanation, 4-8 sentences>",
      "examples": ["<worked example or concrete illustration>", "..."],
      "common_mistakes": ["<misconception or error students commonly make>", "..."]
    }}
  ],
  "formula_cards": [
    {{
      "formula_name": "...", "expression": "...", "variables": ["..."],
      "units": ["..."], "conditions": "...", "common_mistakes": ["..."],
      "worked_example": "..."
    }}
  ],
  "key_takeaways": ["<concise recap point>", "..."],
  "further_reading": [{{"title": "...", "url": "...", "note": "<why it's useful>"}}]
}}

Respond ONLY with valid JSON."""

CHAT_SYSTEM = (
    "You are Nexus Core, tutoring a student on this specific week's lesson. "
    "Answer only using the lesson context and general subject knowledge; "
    "stay focused on this course/week. Be concise and clear, plain text, no markdown headers."
)


# ── Generation ─────────────────────────────────────────────────────────────

async def generate_lesson(
    course_id: str, course_code: str, course_title: str,
    week_number: int, lecture_text: str,
) -> dict[str, Any]:
    """Generate a structured lesson for a course/week using AI.

    Raises ValueError on failure — never synthesises placeholder content.
    """
    if _mock_questions_allowed():
        raise ValueError(
            "Mock mode is not supported for lesson generation — configure a real AI_PROVIDER."
        )

    # Fetch supplementary web references
    try:
        refs = await duckduckgo_search(
            f"{course_title} {course_code} week {week_number} concepts",
            limit=4,
        )
    except Exception:
        refs = []
    web_context = "\n".join(
        f"- {r.get('title', '')}: {r.get('snippet', '')} ({r.get('url', '')})"
        for r in refs
    ) or "No external references available — teach strictly from the lecture content."

    raw = await call_ai(
        LESSON_PROMPT.format(
            course_code=course_code,
            course_title=course_title,
            week_number=week_number,
            lecture_text=lecture_text[:6000],
            web_context=web_context,
        ),
        LESSON_SYSTEM,
        max_tokens=3000,
    )
    data = json.loads(clean_json(raw))
    if not data.get("sections"):
        raise ValueError(
            f"AI returned no usable lesson content for {course_code} week {week_number}"
        )
    data["further_reading"] = data.get("further_reading") or [
        {"title": r.get("title", ""), "url": r.get("url", ""), "note": ""}
        for r in refs
    ]
    return data





async def chat_with_lesson(
    course_id: str,
    week_number: int,
    message: str,
    history: list[dict[str, str]],
) -> str:
    """Chat with the lesson as context."""
    from app.core.database import lessons_col

    lesson = await lessons_col().find_one(
        {"course_id": course_id, "week_number": week_number}
    )
    if not lesson:
        raise ValueError("Generate the lesson first")

    transcript = "\n".join(
        f"{h['role'].upper()}: {h['content']}"
        for h in (history or [])[-10:]
    )

    context = {
        k: lesson.get(k)
        for k in ("overview", "sections", "key_takeaways")
    }
    prompt = (
        f"LESSON CONTEXT:\n{json.dumps(context, ensure_ascii=False)}\n\n"
        f"CONVERSATION SO FAR:\n{transcript}\n\n"
        f"STUDENT: {message}\n\nTUTOR:"
    )
    reply = await call_ai(prompt, CHAT_SYSTEM, max_tokens=600)
    return reply.strip()
