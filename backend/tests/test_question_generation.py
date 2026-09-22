import json
import unittest
from unittest.mock import AsyncMock, patch

from app.services.ai_service import (
    QuestionGenerationError,
    analyze_pdf_text,
    build_adaptive_context,
    extract_pdf_text,
    generate_questions,
    question_count_for,
)


SOURCE = ("Mitosis produces two genetically identical daughter cells after chromosome separation. " * 12)


def question(number: int) -> dict:
    return {
        "question_text": f"According to the lecture, what happens in mitosis ({number})?",
        "options": {"A": "Two identical daughter cells form", "B": "Four gametes form", "C": "DNA is not copied", "D": "Chromosomes vanish"},
        "correct_answer": "A",
        "explanation": "The lecture states that mitosis produces two genetically identical daughter cells.",
        "source_excerpt": "Mitosis produces two genetically identical daughter cells after chromosome separation.",
        "solution_steps": ["Read the lecture statement.", "Select the matching answer."],
    }


def open_question(number: int) -> dict:
    return {
        "question_text": f"Explain the significance of mitosis in cell division ({number}).",
        "model_answer": (
            "Mitosis produces two genetically identical daughter cells after chromosome "
            "separation, maintaining the chromosome number across cell generations."
        ),
        "marking_points": [
            "States that two identical daughter cells form",
            "Mentions chromosome separation",
        ],
        "source_excerpt": "Mitosis produces two genetically identical daughter cells after chromosome separation.",
        "difficulty": "medium",
        "topic": "Cell division",
    }


class QuestionGenerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_retries_underfilled_batches_until_requested_count_is_met(self):
        # Simulate the observed provider behaviour: one valid item despite a larger request.
        responses = [json.dumps({"questions": [question(index)]}) for index in range(20)]
        with patch("app.services.ai_service._recent_model_feedback", AsyncMock(return_value="none")), patch(
            "app.services.ai_service.call_ai", AsyncMock(side_effect=responses)
        ):
            questions = await generate_questions(SOURCE, "BIO101", "Biology", 1, count=20)

        self.assertEqual(20, len(questions))
        self.assertTrue(all(item["source_excerpt"] in SOURCE for item in questions))

    async def test_rejects_incomplete_generation_instead_of_returning_partial_questions(self):
        with patch("app.services.ai_service._recent_model_feedback", AsyncMock(return_value="none")), patch(
            "app.services.ai_service.call_ai", AsyncMock(return_value=json.dumps({"questions": [question(1)]}))
        ):
            with self.assertRaises(QuestionGenerationError):
                await generate_questions(SOURCE, "BIO101", "Biology", 1, count=2)

    async def test_413_reduces_the_excerpt_before_retrying(self):
        class TooLarge(Exception):
            status_code = 413

        ai = AsyncMock(side_effect=[TooLarge("request too large"), json.dumps({"questions": [question(1)]})])
        with patch("app.services.ai_service._recent_model_feedback", AsyncMock(return_value="none")), patch(
            "app.services.ai_service.call_ai", ai
        ):
            questions = await generate_questions(SOURCE, "BIO101", "Biology", 1, count=1)

        self.assertEqual(1, len(questions))
        self.assertLess(len(ai.call_args_list[1].args[0]), len(ai.call_args_list[0].args[0]))

    async def test_429_retries_with_backoff(self):
        class RateLimited(Exception):
            status_code = 429

        with patch("app.services.ai_service._recent_model_feedback", AsyncMock(return_value="none")), patch(
            "app.services.ai_service.call_ai",
            AsyncMock(side_effect=[RateLimited("rate limited"), json.dumps({"questions": [question(1)]})]),
        ), patch("app.services.ai_service.asyncio.sleep", AsyncMock()) as sleep:
            questions = await generate_questions(SOURCE, "BIO101", "Biology", 1, count=1)

        self.assertEqual(1, len(questions))
        sleep.assert_awaited_once_with(1)

    async def test_accepts_model_json_with_unescaped_latex_backslashes(self):
        malformed_json = json.dumps({"questions": [question(1)]})
        malformed_json = malformed_json.replace(
            "Two identical daughter cells form", r"\\frac{a}{b} identical daughter cells form", 1
        )
        # Simulate a model writing LaTex directly into JSON rather than using
        # the required doubled JSON backslash.
        malformed_json = malformed_json.replace(r"\\\\frac", r"\\frac")

        with patch("app.services.ai_service._recent_model_feedback", AsyncMock(return_value="none")), patch(
            "app.services.ai_service.call_ai", AsyncMock(return_value=malformed_json)
        ):
            questions = await generate_questions(SOURCE, "BIO101", "Biology", 1, count=1)

        self.assertEqual(1, len(questions))
        self.assertIn(r"\frac{a}{b}", questions[0]["options"]["A"])

    async def test_generates_open_ended_questions_for_theory_courses(self):
        with patch("app.services.ai_service._recent_model_feedback", AsyncMock(return_value="none")), patch(
            "app.services.ai_service.call_ai",
            AsyncMock(return_value=json.dumps({"questions": [open_question(1)]})),
        ):
            questions = await generate_questions(
                SOURCE, "BIO101", "Biology", 1, count=1, assessment_type="theory"
            )

        self.assertEqual(1, len(questions))
        self.assertEqual("theory", questions[0]["question_type"])
        self.assertIsNone(questions[0]["options"])
        self.assertIsNone(questions[0]["correct_answer"])
        self.assertTrue(questions[0]["explanation"])
        self.assertTrue(questions[0]["solution_steps"])

    def test_open_ended_assessments_are_capped_at_five_questions(self):
        self.assertEqual(5, question_count_for("theory"))
        self.assertEqual(5, question_count_for("essay"))
        self.assertEqual(20, question_count_for("mcq"))
        self.assertEqual(20, question_count_for("mixed"))
        # Unknown values fall back to the MCQ default.
        self.assertEqual(20, question_count_for("something-else"))

    def test_extract_stage_rejects_unreadable_pdf_text(self):
        with patch(
            "app.services.ai_service.extract_text_from_pdf",
            return_value="too short to be a lecture",
        ):
            with self.assertRaises(ValueError):
                extract_pdf_text("lecture.pdf")

    async def test_analysis_failure_raises_instead_of_faking_content(self):
        # Once extraction succeeds, a provider failure during analysis must raise
        # (so the stage can be retried) — never fall back to placeholder content.
        with patch(
            "app.services.ai_service.call_ai",
            AsyncMock(side_effect=RuntimeError("groq unavailable")),
        ):
            with self.assertRaises(RuntimeError):
                await analyze_pdf_text(SOURCE, "Biology")

    def test_build_adaptive_context_uses_supplied_profile(self):
        summary = {
            "topics": ["Algebra"],
            "key_formulas": ["x = y"],
            "key_points": ["Solve for x"],
            "profile": {
                "is_formula_heavy": True,
                "mix_targets": {"calculation": 60, "application": 20, "theory": 20},
            },
        }
        _profile, context = build_adaptive_context(summary, "Maths")

        self.assertTrue(context["is_formula_heavy"])
        self.assertEqual(60, context["mix_targets"]["calculation"])
        self.assertEqual(["Algebra"], context["topics"])
