# Scholara Frontend

**React + TypeScript + Vite + TailwindCSS + Framer Motion**

Midnight Indigo (`#212842`) & Vanilla Cream (`#F0E7D5`) themed EdTech platform.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit VITE_API_URL to point at your backend (default: http://localhost:8000/api)
```

### 3. Start development server
```bash
npm run dev
```

App runs at `http://localhost:5173`

### 4. Production build
```bash
npm run build
# Output in /dist
```

## Architecture

### Auth Flow
1. User signs in with email + password
2. Tokens live in sessionStorage (no localStorage); the API client handles refresh
3. Role (superadmin/admin/student) is enforced on the backend

### Assessment types
Courses declare an assessment type (`mcq` · `mixed` · `theory` · `essay`).
MCQ and mixed courses generate 20 multiple-choice questions per uploaded PDF.
Theory and essay courses generate **at most 5** open-ended questions per PDF —
the learner answers in writing and self-assesses against a revealed model answer.
`QuestionCard` switches to the open-ended flow automatically based on
`question_type`; the course list/detail views show the assessment type, and it
can be edited from the course card (applies to new uploads).

### PDF upload & processing
Admins upload PDFs from the course card. Each file is shown immediately with its
name and size, then the UI reports the backend processing stage
(`Reading PDF content` → `Analyzing content` → `Generating questions` →
`Completed`) instead of a generic spinner, polling while work is in progress.
Failures show the error with a Retry action; repeated retry clicks are ignored
while a job is in flight, and the backend rejects duplicate uploads of the same
file while one is still queued.

### Key Pages
- `/auth` — sign in
- `/` — Daily feed (60 questions with Progress Gate) and focused practice
- `/courses` — Course list, assessment type, PDF upload, AI summaries
- `/courses/:id` — Course detail, week grid, offline download
- `/courses/:id/weeks/:week/learn` — "Teach Me" lesson
- `/study` — Study Cycle timetable + exam schedule
- `/profile` — Account management
- `/admin` — Admin panel (exam timetable, study cycle, calendar, flags, users, PDF jobs)

### SuperAdmin Features
Email: `info.praisechinedu@gmail.com`
- Full user management
- Exam timetable CRUD
- Study cycle editor
- Academic calendar management
- Course creation (with assessment type)

## Design System
- **Font Display:** Playfair Display
- **Font Body:** DM Sans
- **Font Mono:** JetBrains Mono
- **Primary BG:** `#212842` (Midnight Indigo)
- **Text/Accent:** `#F0E7D5` (Vanilla Cream)
- **Gold Accent:** `#c9a84c`
