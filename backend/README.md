# Scholara Backend — Nexus Core AI Engine

**FastAPI + Motor (async MongoDB) + Python + Groq**

## Setup

### 1. Prerequisites
- Python 3.11+
- MongoDB 7 (local or Atlas free tier)

### 2. Virtual environment
```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
```

Edit `.env`. The platform uses **one AI provider**:
```
GROQ_API_KEY=gsk_...            # free key from https://console.groq.com
GROQ_MODEL=openai/gpt-oss-20b
```
Groq's free tier needs no credit card. `openai/gpt-oss-20b` is the current
supported model; the retired `llama-3.1-70b-versatile` /
`llama-3.1-70b-instant` models are not referenced anywhere.

There is deliberately **no multi-provider fallback and no mock mode**. When a
Groq request fails it raises, the job records the failure, and the failed
pipeline stage is retried — rather than silently returning fake content from a
second (half-working) provider.

### 4. Seed database
```bash
python seed.py
```

### 5. Run
```bash
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs (development only)

---

## Supported AI models

| Setting | Value | Notes |
| ------- | ----- | ----- |
| `GROQ_MODEL` | `openai/gpt-oss-20b` | Primary and only model |

Retired / removed: `llama-3.1-70b-versatile`, `llama-3.1-70b-instant`, every
Gemini provider (`GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_PROVIDER`) and all mock
generation (`AI_PROVIDER=mock`, `ALLOW_MOCK_QUESTION_GENERATION`).

---

## Assessment types

Every course declares an `assessment_type` (set at creation and editable later
from the course card). It controls the question count **per uploaded PDF**:

| `assessment_type` | Questions per PDF | Format |
| ----------------- | ----------------- | ------ |
| `mcq` (default)   | 20                | Multiple-choice, options A–D, auto-graded |
| `mixed`           | 20                | Multiple-choice with a theory-biased style mix |
| `theory`          | **at most 5**     | Open-ended — model answer + marking points, self-assessed |
| `essay`           | **at most 5**     | Open-ended — model answer + marking points, self-assessed |

> The 5-question limit applies **only** to theory/essay courses. MCQ/mixed
> courses keep the full 20-question bank. This is enforced by
> `question_count_for()` and asserted in `tests/test_question_generation.py`.

Open-ended questions are stored with `options: null`, `correct_answer: null`, a
model answer in `explanation`, and marking points in `solution_steps`. The
learner writes a response, reveals the model answer, and self-assesses. Those
attempts are recorded with `is_correct: null` and excluded from accuracy, which
is computed only over auto-graded MCQ attempts.

---

## PDF processing pipeline

Uploads are handled by a persistent, restart-resilient MongoDB worker
(`app/services/job_worker.py`). No Redis or Celery — job state lives in the
`pdf_jobs` collection.

The pipeline runs as **resumable stages**, each persisted before the next begins:

1. **Upload** — `POST /api/courses/{id}/upload-pdf` streams the file to disk and
   inserts a `pdf_jobs` document (`status: pending`). An accidental duplicate
   upload of the same file for the same course/week is rejected with `409` while
   a previous copy is still queued or processing.
2. **extracting** — PyMuPDF reads the PDF off the event loop. The extracted text
   is stored on `course_pdfs` (`extracted_text`, `extraction_complete: true`).
3. **analyzing** — one Groq call produces the summary, key points, formulas and
   adaptive course profile (`analysis_complete: true`).
4. **generating** — MCQs in small batches, or at most 5 open-ended questions for
   essay/theory courses (`questions_complete: true`). Any pre-existing questions
   for the PDF are replaced, never appended.
5. **persisting** — course intelligence (topics, formulas, deep-dive notes) is
   upserted. This stage is auxiliary and non-fatal.

### Why stages matter

- **A failed AI step never discards extracted text.** If extraction succeeds but
  analysis or generation fails, the text stays persisted, so a retry resumes at
  the failed stage instead of re-reading the PDF and re-billing the whole job.
- **Idempotent question writes** — questions for a PDF are deleted before being
  rewritten, so retries can never duplicate rows.
- **Per-stage lease** — `processing_started_at` is renewed at each stage, so a
  job working through several stages is not mistaken for a stalled one.

### Reliability

- Each stage runs under `PDF_PROCESSING_TIMEOUT_SECONDS` (default 300s). A
  timeout is recorded with the stage name and requeued with exponential backoff
  (up to 3 attempts).
- `_recover_stalled_jobs()` requeues only jobs whose per-stage lease has expired
  (timeout + 60s grace), so a restarted server never reclaims healthy work.
- `POST /api/courses/{id}/pdfs/{pdf_id}/retry` requeues a failed job or one
  stranded by an interrupted worker, while leaving a healthy in-flight job
  untouched (so repeated retry clicks cannot trigger duplicate processing).
- Once a stage's output exists, re-running the job skips it — a successfully
  processed PDF is never regenerated unnecessarily.
- The heavy `extracted_text` payload is never returned by the list endpoint.

### Processing state on the client

`GET /api/courses/{id}/pdfs` returns, per PDF:

```
processing_status: pending | claimed | processing | done | failed
processing_stage:  extracting | analyzing | generating | persisting | done
processing_error:  <last error message>
file_size:         <bytes>
```

The admin UI shows the stage label (e.g. "Reading PDF content", "Generating
questions"), the file name/size, and a Retry action on failure.

---

## Auth
Password-based sign-in (`POST /api/auth/signin`) with short-lived access tokens
(15 minutes) and refresh tokens (7 days). SuperAdmin email auto-gets the
superadmin role. Signup is gated by `SIGNUP_INVITE_CODE`.

## MongoDB Collections
`users` · `courses` · `course_pdfs` · `questions` · `pdf_jobs`
`week_progress` · `daily_feeds` · `question_attempts`
`exam_slots` · `study_cycles` · `academic_calendars`
`course_profiles` · `course_topics` · `course_formulas` · `course_notes`
`question_flags` · `model_feedback` · `audit_logs`

## Tests
```bash
cd backend
python -m unittest tests.test_question_generation
```
Covers MCQ generation/retry, theory/essay open-ended generation, the 5-question
cap for theory/essay (and that MCQ stays at 20), and the extraction/analysis
stage helpers.
