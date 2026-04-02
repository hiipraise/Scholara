# Scholara Backend — Nexus Core AI Engine

**FastAPI + Motor (async MongoDB) + Python**

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

Edit `.env` — choose **one** free AI provider:

#### Option A — Groq (recommended, fastest free tier)
```
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...       # free key from https://console.groq.com
```
No credit card. No billing. Just sign up and copy your key.

#### Option B — Google Gemini Flash
```
AI_PROVIDER=gemini
GEMINI_API_KEY=AIza...     # free key from https://aistudio.google.com/apikey
```
Free tier: 15 requests/minute, 1 million tokens/day.

#### Option C — Mock (no key, for testing UI)
```
AI_PROVIDER=mock
```
Returns placeholder questions and summaries instantly.

### 4. Seed database
```bash
python seed.py
```

### 5. Run
```bash
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

---

## Auth — Email Only
`POST /api/auth/signin { email }` → find or create user → JWT (30-day token)
SuperAdmin email auto-gets superadmin role. No password, no OTP.

## MongoDB Collections
`users` · `courses` · `course_pdfs` · `questions`
`week_progress` · `daily_feeds` · `question_attempts`
`exam_slots` · `study_cycles` · `academic_calendars`