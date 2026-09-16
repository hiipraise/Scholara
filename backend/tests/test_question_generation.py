import json
import unittest
from unittest.mock import AsyncMock, patch

from app.services.ai_service import QuestionGenerationError, generate_questions


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
