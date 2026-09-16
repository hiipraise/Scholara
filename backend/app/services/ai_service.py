"""
Nexus Core — AI Engine for Scholara
Supports Groq (free) and Google Gemini (free) for PDF-grounded generation.

Free API keys:
  Groq   → https://console.groq.com          (no billing, generous limits)
  Gemini → https://aistudio.google.com/apikey (free tier: 15 RPM, 1M TPD)

Set AI_PROVIDER in .env to "groq" or "gemini". Question generation never uses mock or fallback content.
"""
import json
import re
import logging
import asyncio
from typing import Optional, Any
import fitz  # PyMuPDF

from app.core.config import settings
from app.core.database import model_feedback_col
from app.services.intelligence_service import infer_course_profile

logger = logging.getLogger(__name__)

MIN_QUESTION_SOURCE_CHARS = 500
QUESTION_BATCH_SIZE = 5
QUESTION_MAX_BATCH_ATTEMPTS = 12


class QuestionGenerationError(RuntimeError):
    """Raised when a PDF cannot produce the complete requested question set."""


def _http_status(error: Exception) -> Optional[int]:
    """Get an HTTP status from provider SDK errors without coupling to one SDK."""
    for attribute in ("status_code", "status"):
        status = getattr(error, attribute, None)
        if isinstance(status, int):
            return status
    match = re.search(r"\b(413|429)\b", str(error))
    return int(match.group(1)) if match else None


def _normalised_source(value: str) -> str:
    return " ".join(value.casefold().split())


def _split_source_text(text: str, max_chars: int) -> list[str]:
    """Split on paragraph boundaries where possible, retaining all PDF content."""
    chunks: list[str] = []
    current = ""
    for part in re.split(r"\n\s*\n", text):
        part = part.strip()
        if not part:
            continue
        if len(part) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(part[i:i + max_chars] for i in range(0, len(part), max_chars))
        elif current and len(current) + len(part) + 2 > max_chars:
            chunks.append(current)
            current = part
        else:
            current = f"{current}\n\n{part}".strip()
    if current:
        chunks.append(current)
    return chunks or [text]


def _mock_questions_allowed() -> bool:
    return settings.APP_ENV.lower() != "production" and settings.AI_PROVIDER.lower() == "mock" and settings.ALLOW_MOCK_QUESTION_GENERATION



# ── PDF Text Extraction ────────────────────────────────────────────────────

def extract_text_from_pdf(file_path: str) -> str:
    try:
        doc = fitz.open(file_path)
        parts = []
        for i, page in enumerate(doc):
            text = page.get_text("text")
            if text.strip():
                parts.append(f"[Page {i + 1}]\n{text}")
        doc.close()
        return "\n\n".join(parts)
    except Exception as e:
        raise RuntimeError(f"PDF extraction failed: {e}")


# ── Provider: Groq ─────────────────────────────────────────────────────────

async def _call_groq(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    resp = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return resp.choices[0].message.content or ""


# ── Provider: Google Gemini ────────────────────────────────────────────────

async def _call_gemini(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
    import google.generativeai as genai
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        system_instruction=system or None,
    )
    full_prompt = prompt
    resp = await model.generate_content_async(
        full_prompt,
        generation_config={"max_output_tokens": max_tokens, "temperature": 0.7},
    )
    return resp.text or ""


# ── Unified caller ─────────────────────────────────────────────────────────

async def call_ai(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
    provider = settings.AI_PROVIDER.lower()

    if provider == "groq":
        if not settings.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY not set. Get a free key at https://console.groq.com")
        return await _call_groq(prompt, system, max_tokens)

    if provider == "gemini":
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not set. Get a free key at https://aistudio.google.com/apikey")
        return await _call_gemini(prompt, system, max_tokens)

    raise ValueError(f"Unknown AI_PROVIDER '{provider}'. Use 'groq', 'gemini', or 'mock'.")


def clean_json(raw: str) -> str:
    """Backward-compatible alias."""
    return _clean_json(raw)


def _salvage_truncated_json(raw: str) -> Optional[str]:
    """Best-effort repair of JSON truncated mid-output (e.g. max_tokens hit).

    Scans the first ``{``/``[`` onward while tracking strings (so brackets
    inside strings are ignored) and the stack of open brackets. Every position
    where a complete value just ended is recorded; the longest such prefix that
    parses after closing any still-open brackets is returned. Returns None if
    nothing salvageable.
    """
    start = -1
    for i, ch in enumerate(raw):
        if ch in "{[":
            start = i
            break
    if start == -1:
        return None

    closer = {"{": "}", "[": "]"}

    records: list[tuple[int, list[str]]] = []
    stack: list[str] = []
    in_string = False
    escaped = False
    i = start
    n = len(raw)
    while i < n:
        ch = raw[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
                records.append((i + 1, list(stack)))
        else:
            if ch == '"':
                in_string = True
            elif ch in "{[":
                stack.append(ch)
            elif ch in "}]":
                if stack and closer[stack[-1]] == ch:
                    stack.pop()
                    records.append((i + 1, list(stack)))
            elif ch not in ",:\r\n\t ":
                # Bare token (number / true / false / null) — consume it.
                j = i
                while j < n and raw[j] not in ",}]" and not raw[j].isspace():
                    j += 1
                records.append((j, list(stack)))
                i = j - 1
        i += 1

    for end, open_stack in reversed(records):
        if end <= start:
            continue
        prefix = raw[start:end].rstrip()
        if not prefix:
            continue
        candidate = prefix + "".join(closer[op] for op in reversed(open_stack))
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            continue
    return None


def _clean_json(raw: str) -> str:
    """Extract the first JSON object/array from a string.
    Handles markdown code fences, leading/trailing text, and truncated
    content by parsing the longest salvageable JSON prefix."""
    raw = raw.strip()

    # Strip markdown code fences first
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
    raw = raw.strip()

    # Try direct parse first
    try:
        json.loads(raw)
        return raw
    except json.JSONDecodeError:
        pass

    # Extract the outermost JSON value, repairing truncation if possible.
    salvaged = _salvage_truncated_json(raw)
    if salvaged is not None:
        return salvaged

    return raw  # give up, let the caller handle the error


STUDY_CYCLE_SYSTEM = (
    "You are Nexus Core, an academic planning assistant. "
    "Respond ONLY with valid JSON — no markdown, no commentary."
)

STUDY_CYCLE_PROMPT = """\
Create a balanced 5-day study cycle for this semester.

Rules:
- Every course must appear exactly once.
- Use only the supplied course IDs.
- Balance workload across the 5 days using course titles and credit units.
- Avoid putting all difficult or high-credit courses on the same day.
- If the number of courses is fewer than 5, leave some days empty.

Return JSON in this exact shape:
{
  "days": [
    {"day_number": 1, "course_ids": ["..."]},
    {"day_number": 2, "course_ids": ["..."]},
    {"day_number": 3, "course_ids": ["..."]},
    {"day_number": 4, "course_ids": ["..."]},
    {"day_number": 5, "course_ids": ["..."]}
  ]
}

Level: {level}
Semester: {semester}
Courses:
{courses}

Respond ONLY with valid JSON."""


def _fallback_study_cycle(courses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not courses:
        return []

    ordered = sorted(
        courses,
        key=lambda c: (
            -(int(c.get("credit_units", 3)) or 3),
            (c.get("code") or ""),
        ),
    )
    days: dict[int, list[str]] = {1: [], 2: [], 3: [], 4: [], 5: []}
    loads: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}

    for course in ordered:
        day = min(loads, key=loads.get)
        course_id = course.get("course_id")
        if course_id:
            days[day].append(course_id)
            loads[day] += max(1, int(course.get("credit_units", 3)) or 3)

    return [{"day_number": day, "course_ids": days[day]} for day in range(1, 6)]


def _normalize_study_cycle(raw_days: list[dict[str, Any]], courses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    course_ids = [c.get("course_id") for c in courses if c.get("course_id")]
    by_id = {c["course_id"]: c for c in courses if c.get("course_id")}
    assigned: set[str] = set()
    result: dict[int, list[str]] = {1: [], 2: [], 3: [], 4: [], 5: []}

    for day in raw_days:
        try:
            day_number = int(day.get("day_number", 0))
        except (TypeError, ValueError):
            continue
        if day_number not in result:
            continue

        for course_id in day.get("course_ids", []):
            if course_id in by_id and course_id not in assigned:
                result[day_number].append(course_id)
                assigned.add(course_id)

    remaining = [course_id for course_id in course_ids if course_id not in assigned]
    for course_id in remaining:
        course = by_id[course_id]
        day_number = min(
            result,
            key=lambda day: (
                len(result[day]),
                sum(int(by_id[cid].get("credit_units", 3)) or 3 for cid in result[day]),
                day,
            ),
        )
        result[day_number].append(course_id)
        assigned.add(course_id)

    return [{"day_number": day, "course_ids": result[day]} for day in range(1, 6)]


async def generate_study_cycle(level: str, semester: int, courses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_courses = [
        {
            "course_id": str(course.get("_id") or course.get("course_id") or ""),
            "code": course.get("code") or "",
            "title": course.get("title") or "",
            "credit_units": int(course.get("credit_units", 3) or 3),
        }
        for course in courses
        if course.get("_id") or course.get("course_id")
    ]
    normalized_courses = [course for course in normalized_courses if course["course_id"]]

    if not normalized_courses:
        return []

    if settings.AI_PROVIDER == "mock" or (
        not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY
    ):
        return _fallback_study_cycle(normalized_courses)

    try:
        raw = await call_ai(
            STUDY_CYCLE_PROMPT.format(
                level=level,
                semester=semester,
                courses=json.dumps(normalized_courses, ensure_ascii=False, indent=2),
            ),
            STUDY_CYCLE_SYSTEM,
            max_tokens=1200,
        )
        data = json.loads(_clean_json(raw))
        days = data.get("days", []) if isinstance(data, dict) else []
        normalized = _normalize_study_cycle(days, normalized_courses)
        return normalized if normalized else _fallback_study_cycle(normalized_courses)
    except Exception as e:
        logger.error(f"Study cycle generation failed: {e}")
        return _fallback_study_cycle(normalized_courses)


# ── Summary Prompt ─────────────────────────────────────────────────────────

SUMMARY_SYSTEM = (
    "You are Nexus Core, an academic AI for a 100-level software engineering student. "
    "Respond ONLY with valid JSON — no markdown, no preamble."
)

SUMMARY_PROMPT = """\
Analyse this lecture content and return JSON matching this exact schema:
{{
  "summary": "<3-5 sentence academic summary>",
  "key_points": ["<point>", "..."],
  "key_formulas": ["<formula or concept>", "..."],
    "formula_cards": [
        {{
            "formula_name": "<short human-readable name>",
            "expression": "<math expression or formula string>",
            "variables": ["<variable>", "..."],
            "units": ["<unit>", "..."],
            "conditions": "<when it applies>",
            "common_mistakes": ["<mistake>", "..."],
            "worked_example": "<brief worked example>"
        }}
    ],
    "topics": ["<topic>", "..."],
    "profile": {{
        "focus_label": "<balanced|calculation-heavy|theory-heavy|application-heavy>",
        "summary": "<1 sentence profile summary>",
        "is_formula_heavy": <true|false>,
        "mix_targets": {{"calculation": <0-100>, "application": <0-100>, "theory": <0-100>}},
        "difficulty_targets": {{"easy": <0-100>, "medium": <0-100>, "hard": <0-100>}},
        "explanation_mode": "<exam_style|step_by_step>",
        "revision_priority": "<what to revise first>",
        "study_tip": "<practical study advice>"
    }}
}}

LECTURE CONTENT (truncated):
{text}

Respond ONLY with valid JSON."""


async def generate_summary(pdf_text: str) -> dict:
    truncated = pdf_text[:5000]
    if settings.AI_PROVIDER == "mock" or (
        not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY
    ):
        return _mock_summary()

    try:
        raw = await call_ai(SUMMARY_PROMPT.format(text=truncated), SUMMARY_SYSTEM, 1200)
        return json.loads(_clean_json(raw))
    except Exception as e:
        logger.error(f"Summary generation failed: {e}")
        return _mock_summary()


def _mock_summary() -> dict:
    return {
        "summary": (
            "This lecture covers fundamental concepts from the course material. "
            "Students should review the definitions, theorems, and worked examples provided. "
            "Mastering these topics is essential for coursework and examination preparation."
        ),
        "key_points": [
            "Review all definitions introduced in this lecture",
            "Understand the relationship between core concepts",
            "Practice applying theorems to example problems",
            "Note important distinctions highlighted by the lecturer",
        ],
        "key_formulas": ["See lecture slides for specific formulas"],
        "formula_cards": [
            {
                "formula_name": "Core lecture formula",
                "expression": "See lecture slides for specific formulas",
                "variables": [],
                "units": [],
                "conditions": "Use the formula introduced in the lecture notes",
                "common_mistakes": ["Mixing the formula with a related definition"],
                "worked_example": "Apply the lecture formula to a representative problem from the notes.",
            }
        ],
        "topics": ["Core Concepts", "Definitions", "Applications"],
        "profile": {
            "focus_label": "balanced",
            "summary": "The lecture is balanced between understanding and application.",
            "is_formula_heavy": False,
            "mix_targets": {"calculation": 20, "application": 45, "theory": 35},
            "difficulty_targets": {"easy": 30, "medium": 50, "hard": 20},
            "explanation_mode": "exam_style",
            "revision_priority": "Core definitions and lecture applications",
            "study_tip": "Review the lecture once, then practice from the worked examples.",
        },
    }


# ── Question Prompt ────────────────────────────────────────────────────────

QUESTION_SYSTEM = (
    "You are Nexus Core, an exam-intelligence AI that generates deep, exam-quality MCQ questions. "
    "Balance theoretical, application, and calculation styles using the supplied course profile. "
    "Always include robust explanations and steps for calculation/application questions. "
    "Respond ONLY with valid JSON — no markdown. "
    "Avoid generic placeholder templates and repeated boilerplate across questions. "
    "Do NOT produce vague options like 'The primary principle of X...' or 'None of the above' as repeated defaults. "
    "If the excerpt cannot support a question, return no item rather than inventing one."
)

QUESTION_PROMPT = """\
Generate exactly {count} multiple-choice questions from the lecture content below.
Course: {course_code} — {course_title}
Week: {week_number}
Adaptive profile:
- Formula heavy: {is_formula_heavy}
- Question style mix target: {mix_targets}
- Difficulty target: {difficulty_targets}
- Explanation mode: {explanation_mode}
- Known topics: {topics}
- Known formulas: {key_formulas}

Rules:
- Use both the lecture content and topic expansion depth.
- Every question, answer, and explanation must be grounded in this supplied excerpt only; do not use general knowledge.
- Include `source_excerpt`: a short, verbatim phrase from the supplied excerpt that supports the correct answer.
- Include realistic exam-style phrasing.
- 4 options per question labelled A, B, C, D
- Respect the requested style mix and difficulty target.
- For calculation-style questions, ensure the stem requires numeric/logical solving.
- Explanation quality:
  - Provide clear reasoning.
  - Add a `solution_steps` list (at least 2 items for calculation/application).
  - Briefly explain why common wrong logic fails.

Previously flagged feedback to avoid repeating:
{feedback_notes}

Return JSON:
{{
  "questions": [
    {{
      "question_text": "...",
      "question_type": "mcq",
      "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
      "correct_answer": "A",
      "explanation": "...",
      "difficulty": "easy",
      "topic": "...",
      "question_style": "theory|application|calculation",
      "depth_level": "recall|understand|apply|analyze",
      "solution_steps": ["...", "..."],
      "source_excerpt": "exact words copied from the lecture content"
    }}
  ]
}}

LECTURE CONTENT:
{text}

Respond ONLY with valid JSON."""


async def generate_questions(
    pdf_text: str,
    course_code: str,
    course_title: str,
    week_number: int,
    count: int = 20,
    adaptive_context: Optional[dict[str, Any]] = None,
    course_id: Optional[str] = None,
) -> list[dict]:
    adaptive_context = adaptive_context or {}
    feedback_notes = await _recent_model_feedback(course_id, course_code, course_title)

    if len(pdf_text.strip()) < MIN_QUESTION_SOURCE_CHARS:
        logger.error(
            "Question generation blocked for %s week %s: extracted PDF text is too short (%s chars)",
            course_code,
            week_number,
            len(pdf_text.strip()),
        )
        raise ValueError(
            f"Insufficient extracted PDF text for {course_code} week {week_number}; cannot generate real questions"
        )

    source_chunks = _split_source_text(pdf_text, 6000)
    questions: list[dict] = []
    seen_stems: set[str] = set()

    # Keep asking for the missing remainder when a model under-produces.  This
    # allows a provider that returns one item per response to still satisfy 20.
    for batch_attempt in range(max(QUESTION_MAX_BATCH_ATTEMPTS, count)):
        if len(questions) >= count:
            return questions[:count]

        requested = min(QUESTION_BATCH_SIZE, count - len(questions))
        source_chunk = source_chunks[batch_attempt % len(source_chunks)]
        # A 413 means this particular excerpt is too large for the provider.
        # Retry the same batch with successively smaller excerpt windows.
        for provider_attempt in range(3):
            try:
                raw = await call_ai(
                    QUESTION_PROMPT.format(
                        count=requested, course_code=course_code, course_title=course_title,
                        week_number=week_number,
                        is_formula_heavy=adaptive_context.get("is_formula_heavy", False),
                        mix_targets=adaptive_context.get("mix_targets", {"calculation": 25, "application": 40, "theory": 35}),
                        difficulty_targets=adaptive_context.get("difficulty_targets", {"easy": 30, "medium": 50, "hard": 20}),
                        explanation_mode=adaptive_context.get("explanation_mode", "exam_style"),
                        topics=adaptive_context.get("topics", []), key_formulas=adaptive_context.get("key_formulas", []),
                        feedback_notes=feedback_notes, text=source_chunk,
                    ),
                    QUESTION_SYSTEM,
                    # Small batches prevent a truncated response from turning 20 requested questions into one.
                    max_tokens=min(3500, max(1200, requested * 650)),
                )
                data = json.loads(_clean_json(raw))
                raw_questions = data.get("questions", [])
                break
            except Exception as exc:
                status = _http_status(exc)
                if status == 413 and len(source_chunk) > MIN_QUESTION_SOURCE_CHARS:
                    source_chunk = source_chunk[:max(MIN_QUESTION_SOURCE_CHARS, len(source_chunk) // 2)]
                    logger.warning("Groq rejected question context as too large; retrying with %d chars", len(source_chunk))
                elif status == 429:
                    delay = 2 ** provider_attempt
                    logger.warning("Groq rate limited question generation; retrying in %ds", delay)
                    await asyncio.sleep(delay)
                else:
                    raise QuestionGenerationError(f"Question generation provider failed: {exc}") from exc
                if provider_attempt == 2:
                    raise QuestionGenerationError(f"Question generation provider failed after retry: {exc}") from exc
        else:  # pragma: no cover - the loop always breaks or raises
            raw_questions = []

        source_normalized = _normalised_source(source_chunk)
        for q in raw_questions if isinstance(raw_questions, list) else []:
            options = q.get("options") or {}
            correct_answer = str(q.get("correct_answer") or "").upper()
            stem = str(q.get("question_text") or "").strip()
            excerpt = str(q.get("source_excerpt") or "").strip()
            stem_key = _normalised_source(stem)
            if (
                not stem or stem_key in seen_stems or correct_answer not in {"A", "B", "C", "D"}
                or set(options) != {"A", "B", "C", "D"} or not all(str(v).strip() for v in options.values())
                or len(excerpt) < 12 or _normalised_source(excerpt) not in source_normalized
            ):
                logger.warning("Discarded an ungrounded, malformed, or duplicate AI question")
                continue
            seen_stems.add(stem_key)
            questions.append({
                "question_text": stem, "question_type": q.get("question_type", "mcq"),
                "options": options, "correct_answer": correct_answer,
                "explanation": str(q.get("explanation") or "").strip(),
                "difficulty": q.get("difficulty", "medium"), "topic": q.get("topic", ""),
                "question_style": q.get("question_style", "application"),
                "depth_level": q.get("depth_level", "apply"),
                "solution_steps": q.get("solution_steps", []), "source_excerpt": excerpt, "source": "ai",
            })
            if len(questions) == count:
                return questions

    raise QuestionGenerationError(
        f"Generated {len(questions)} of {count} grounded questions for {course_code} week {week_number}; refusing incomplete output"
    )


# ── Full PDF Pipeline ──────────────────────────────────────────────────────

async def process_pdf_file(
    file_path: str,
    course_code: str,
    course_title: str,
    week_number: int,
    question_count: int = 20,
    course_id: Optional[str] = None,
    generate_questions_for_pdf: bool = True,
) -> dict:
    text = extract_text_from_pdf(file_path)
    text_len = len(text.strip())
    logger.info(
        "Extracted %s characters from PDF for %s week %s before AI prompt construction",
        text_len,
        course_code,
        week_number,
    )
    if text_len < MIN_QUESTION_SOURCE_CHARS:
        logger.error(
            "PDF extraction produced insufficient text for %s week %s: %s chars from %s",
            course_code,
            week_number,
            text_len,
            file_path,
        )
        raise ValueError("PDF appears empty, unreadable, or too short for real question generation")

    summary_data = await generate_summary(text)
    inferred_profile = infer_course_profile(
        course_title=course_title,
        topics=summary_data.get("topics", []),
        formulas=summary_data.get("key_formulas", []),
        key_points=summary_data.get("key_points", []),
    )
    adaptive_context = {
        "is_formula_heavy": (summary_data.get("profile") or {}).get("is_formula_heavy", inferred_profile.get("is_formula_heavy", False)),
        "mix_targets": (summary_data.get("profile") or {}).get("mix_targets", inferred_profile.get("mix_targets", {"calculation": 25, "application": 40, "theory": 35})),
        "difficulty_targets": (summary_data.get("profile") or {}).get("difficulty_targets", inferred_profile.get("difficulty_targets", {"easy": 30, "medium": 50, "hard": 20})),
        "explanation_mode": (summary_data.get("profile") or {}).get("explanation_mode", inferred_profile.get("explanation_mode", "exam_style")),
        "topics": summary_data.get("topics", []),
        "key_formulas": summary_data.get("key_formulas", []),
    }
    questions = (
        await generate_questions(
            text, course_code, course_title, week_number, question_count, adaptive_context, course_id
        )
        if generate_questions_for_pdf
        else []
    )

    return {
        "text_length":   len(text),
        "extracted_text": text,
        "summary":       summary_data.get("summary", ""),
        "key_points":    summary_data.get("key_points", []),
        "key_formulas":  summary_data.get("key_formulas", []),
        "formula_cards": summary_data.get("formula_cards", []),
        "topics":        summary_data.get("topics", []),
        "questions":     questions,
        "profile":       summary_data.get("profile") or inferred_profile,
    }


async def _recent_model_feedback(course_id: Optional[str], course_code: str, course_title: str, limit: int = 5) -> str:
    """Summarize recent flagged feedback so future generation avoids repeating it."""
    if not course_id:
        return "- No prior course-specific feedback available."

    docs = await model_feedback_col().find({
        "course_id": course_id,
        "status": {"$ne": "archived"},
    }).sort("created_at", -1).limit(limit).to_list(limit)

    if not docs:
        return f"- No prior feedback found for {course_code} — {course_title}."

    lines: list[str] = []
    for doc in docs:
        reason = (doc.get("reason") or "").strip() or "flagged for quality review"
        sample = (doc.get("question_text") or "").strip().replace("\n", " ")
        if len(sample) > 140:
            sample = sample[:137] + "..."
        status = (doc.get("status") or "pending").strip()
        resolution_note = (doc.get("resolution_note") or "").strip()
        deactivated = doc.get("deactivated")
        extra = resolution_note or ("question was disabled" if deactivated else "question was reviewed")
        lines.append(f"- [{status}] Avoid patterns like: {sample} | reason: {reason} | {extra}")
    return "\n".join(lines)
