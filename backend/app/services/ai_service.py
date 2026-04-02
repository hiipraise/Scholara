"""
Nexus Core — AI Engine for Scholara
Supports Groq (free), Google Gemini (free), or mock fallback.

Free API keys:
  Groq   → https://console.groq.com          (no billing, generous limits)
  Gemini → https://aistudio.google.com/apikey (free tier: 15 RPM, 1M TPD)

Set AI_PROVIDER in .env to "groq", "gemini", or "mock".
"""
import json
import re
import logging
from typing import Optional
import fitz  # PyMuPDF

from app.core.config import settings

logger = logging.getLogger(__name__)


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

async def _call_ai(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
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


def _clean_json(raw: str) -> str:
    """Strip markdown code fences if the model wraps JSON in them."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
    return raw.strip()


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
  "topics": ["<topic>", "..."]
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
        raw = await _call_ai(SUMMARY_PROMPT.format(text=truncated), SUMMARY_SYSTEM, 1200)
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
        "topics": ["Core Concepts", "Definitions", "Applications"],
    }


# ── Question Prompt ────────────────────────────────────────────────────────

QUESTION_SYSTEM = (
    "You are Nexus Core, an academic AI that generates exam-quality MCQ questions "
    "for a software engineering student. Respond ONLY with valid JSON — no markdown."
)

QUESTION_PROMPT = """\
Generate exactly {count} multiple-choice questions from the lecture content below.
Course: {course_code} — {course_title}
Week: {week_number}

Rules:
- Each question must be clearly rooted in the lecture content
- 4 options per question labelled A, B, C, D
- Difficulty mix: 40% easy, 40% medium, 20% hard
- Provide a clear explanation for the correct answer

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
      "topic": "..."
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
) -> list[dict]:
    truncated = pdf_text[:6000]
    if settings.AI_PROVIDER == "mock" or (
        not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY
    ):
        return _mock_questions(course_code, course_title, week_number, count)

    try:
        raw = await _call_ai(
            QUESTION_PROMPT.format(
                count=count,
                course_code=course_code,
                course_title=course_title,
                week_number=week_number,
                text=truncated,
            ),
            QUESTION_SYSTEM,
            max_tokens=3500,
        )
        data = json.loads(_clean_json(raw))
        qs = data.get("questions", [])
        # Groq/Gemini might return slightly fewer — pad with mocks if needed
        if len(qs) < count:
            qs += _mock_questions(course_code, course_title, week_number, count - len(qs))
        return qs[:count]
    except Exception as e:
        logger.error(f"Question generation failed: {e}")
        return _mock_questions(course_code, course_title, week_number, count)


def _mock_questions(
    course_code: str, course_title: str, week_number: int, count: int
) -> list[dict]:
    topics = [
        "Fundamental Concepts", "Core Definitions", "Applied Theory",
        "Problem Solving", "Key Algorithms", "Data Structures",
        "Mathematical Foundations", "Systems Design",
    ]
    difficulties = ["easy", "medium", "medium", "hard"]
    questions = []
    for i in range(count):
        topic = topics[i % len(topics)]
        diff  = difficulties[i % len(difficulties)]
        questions.append({
            "question_text": (
                f"[{course_code} | Week {week_number} | Q{i+1}] "
                f"Which statement best describes a key concept from '{topic}' "
                f"as covered in {course_title}?"
            ),
            "question_type": "mcq",
            "options": {
                "A": f"The primary principle of {topic} establishes a foundational rule",
                "B": f"A secondary characteristic observed in {topic} exceptions",
                "C": f"An indirect consequence derived from {topic} theory",
                "D": f"None of the above definitions apply to {topic}",
            },
            "correct_answer": "A",
            "explanation": (
                f"Option A correctly identifies the primary principle. "
                f"This concept is foundational to {course_title} Week {week_number}. "
                f"Review your lecture notes to reinforce this understanding."
            ),
            "difficulty": diff,
            "topic": topic,
        })
    return questions


# ── Full PDF Pipeline ──────────────────────────────────────────────────────

async def process_pdf_file(
    file_path: str,
    course_code: str,
    course_title: str,
    week_number: int,
    question_count: int = 20,
) -> dict:
    text = extract_text_from_pdf(file_path)
    if not text.strip():
        raise ValueError("PDF appears empty or unreadable")

    summary_data = await generate_summary(text)
    questions    = await generate_questions(text, course_code, course_title, week_number, question_count)

    return {
        "text_length":  len(text),
        "summary":      summary_data.get("summary", ""),
        "key_points":   summary_data.get("key_points", []),
        "key_formulas": summary_data.get("key_formulas", []),
        "topics":       summary_data.get("topics", []),
        "questions":    questions,
    }