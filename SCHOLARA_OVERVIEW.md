# Scholara — Platform Overview & Codebase Analysis

This document describes the Scholara platform: purpose, architecture, how the frontend and backend work, important pages and components, data models, workflows, and developer notes to extend or debug the project.

> Location: root of the repository. Use this as a single-source reference for maintainers and contributors.

---

## 1. Summary

- Purpose: Scholara is a learning platform that delivers question-driven study feeds, focused practice, study cycles, course materials (PDFs), and admin tooling to manage content, flagged questions, and academic timetables.
- Stack:
  - Frontend: React + TypeScript, Vite, Tailwind CSS, Framer Motion, react-query (@tanstack/react-query), Zustand for auth store.
  - Backend: FastAPI (Python), Pydantic models, MongoDB for persistence, background processing for PDF ingestion / AI summarization.
  - Deployment: Dockerfiles for both frontend and backend included.

---

## 2. Repository Structure (high level)

- [backend](backend): FastAPI app and related services.
  - [backend/main.py](backend/main.py) — app entry (uvicorn).
  - [backend/app/api/](backend/app/api/) — API routers grouped by domain (courses, admin, users, feed, etc.).
  - [backend/app/models/](backend/app/models/) — Pydantic/ODM models.
  - [backend/app/services/](backend/app/services/) — Business logic (email, AI, study cycle helpers).

- [frontend](frontend): React app.
  - [frontend/src/main.tsx](frontend/src/main.tsx) — app bootstrap.
  - [frontend/src/App.tsx](frontend/src/App.tsx) — route mount points (pages).
  - [frontend/src/pages/](frontend/src/pages/) — top-level pages, including:
    - [frontend/src/pages/HomePage.tsx](frontend/src/pages/HomePage.tsx)
    - [frontend/src/pages/StudyPage.tsx](frontend/src/pages/StudyPage.tsx)
    - [frontend/src/pages/CoursesPage.tsx](frontend/src/pages/CoursesPage.tsx)
    - [frontend/src/pages/AdminPage.tsx](frontend/src/pages/AdminPage.tsx)
    - [frontend/src/pages/ProfilePage.tsx](frontend/src/pages/ProfilePage.tsx)
  - [frontend/src/components/] — UI components, feed items, layout, and admin widgets.
  - [frontend/src/api/index.ts](frontend/src/api/index.ts) — typed API client wrappers.
  - [frontend/src/store/authStore.ts](frontend/src/store/authStore.ts) — lightweight user store.

---

## 3. Frontend: architecture & how it works

### 3.1 Entry & routing

- App bootstraps in [frontend/src/main.tsx](frontend/src/main.tsx) and mounts `App` which handles routing to pages. `react-query` provider and global theme/providers are set up here.

### 3.2 State management

- Local UI state: per-component useState/useReducer.
- Global auth/profile: `useAuthStore` (Zustand) stores user, level, semester, and role. Components read this to filter courses and select term-specific data.
- Server state: react-query handles fetching, caching, invalidation, and background refetching for APIs like `/feed`, `/courses`, `/admin/study-cycle`, etc.

### 3.3 API client

- [frontend/src/api/index.ts](frontend/src/api/index.ts) centralizes typed API calls (e.g., `feedApi.getToday()`, `coursesApi.list()`, `adminApi.getStudyCycle()`). This keeps pages thin: they call these functions and react-query wraps them.

### 3.4 Key pages and logic

- Home / Feed ([frontend/src/pages/HomePage.tsx](frontend/src/pages/HomePage.tsx))
  - Delivers the daily practice feed and focused practice.
  - Uses `feedApi.getToday()` and `feedApi.submitAnswer()` to advance questions and show completion modal when the set is finished.
  - Keeps a local set of hidden question IDs (for flagged questions in focused practice) so the feed does not present them immediately.

- Study ([frontend/src/pages/StudyPage.tsx](frontend/src/pages/StudyPage.tsx))
  - Fetches study cycle (`adminApi.getStudyCycle`) and academic calendars (`adminApi.getCalendars`).
  - Displays today + next 2 days and a full 5-day cycle tile.
  - Recent enhancement: a `smartCycle` computed client-side that prioritizes non-empty courses and de-duplicates consecutive days (uses `coursesApi.list` to score courses by `question_count` and `pdf_count`).

- Courses ([frontend/src/pages/CoursesPage.tsx](frontend/src/pages/CoursesPage.tsx))
  - Lists courses for the user-selected `level` and `semester` (from `useAuthStore`).
  - Admins can add courses, upload PDFs to a course, edit PDF week numbers, and soft-delete courses.
  - `CourseCard` presents an expandable UI showing PDF uploads and a list of course PDFs (component `PDFRow`).
  - NOTE: `CourseCard` uses `role="button"` wrapper to avoid nested `<button>` warnings; inner buttons use `e.stopPropagation()` to avoid toggling the card when interacting with controls.
  - PDF upload enforcement: server-side MIME validation, 50 MB max file size, and per-admin upload rate limiting.

- Admin ([frontend/src/pages/AdminPage.tsx](frontend/src/pages/AdminPage.tsx))
  - Tabs: Exam Timetable, Study Cycle editing, Academic Calendar, Question Flags, Users.
  - Question Flags: resolve individual flags or run bulk resolve/disable (replaces `window.confirm` with an in-app modal). Bulk actions call `adminApi.resolveAllQuestionFlags`.
  - Study Cycle Admin allows editors to assign `course_ids` to days and call `adminApi.updateStudyCycle`.

- Profile ([frontend/src/pages/ProfilePage.tsx](frontend/src/pages/ProfilePage.tsx))
  - Users can update `level` and `semester` which affects Courses and StudyCycle queries.

### 3.5 Components and UX patterns

- UI primitives: Tailwind classes and small helper components (badges, buttons, modals built with `framer-motion` and `AnimatePresence`).
- Toasting & errors: `react-hot-toast` used for success/error messages on mutations.

### 3.6 Accessibility & keyboard

- Accessible toggles: divs with `role="button"` and `tabIndex=0` plus `onKeyDown` handlers for Enter/Space when a non-button wrapper is required (used to avoid nested native buttons).

---

## 4. Backend: architecture & how it works

### 4.1 Entry and layout

- The FastAPI app is started in [backend/main.py](backend/main.py) and composes routers from `app/api/*`.
- Core concerns are in `app/core` (database connection, config, security deps, rate limiting, email verification helpers).

### 4.2 Major API domains (routers)

- Feed API (`/feed`)
  - `GET /feed/today` returns the user's feed for the day.
  - `POST /feed/answer` records answers and returns `AnswerResult` including whether the answer was correct and an explanation.
  - Metrics: `GET /feed/progress`, `GET /feed/history` and `GET /feed/insights`.

- Courses API (`/courses`)
  - `GET /courses` lists courses filtered by level/semester.
  - `POST /courses` creates a new course (Admin access required via `get_admin_user`).
  - `DELETE /courses/{id}` performs a soft-delete: marks course and related PDFs/questions inactive so they are excluded from student views.
  - PDF upload endpoints handle multipart files; after upload AI/background services process PDFs to extract summaries/key points.

- Admin API (`/admin/*`)
  - Study cycle: `GET /admin/study-cycle`, `PUT /admin/study-cycle` to update days (editors/admins only).
  - Exam timetable CRUD under `/admin/exam-timetable`.
  - Question flags: list flags `GET /admin/question-flags`, resolve per-question or bulk resolve (soft-disable question and close flags) `PATCH /admin/question-flags/resolve` and `/resolve-all`.
  - Users: listing and role management, deactivation.

- Users API (`/users/*`)
  - `GET /users/me` and `PUT /users/me` allow a user to update profile fields including `level` and `semester`.

### 4.3 Data & models

- Primary entities: `User`, `Course`, `CoursePDF`, `Question`, `QuestionFlag`, `StudyCycleDay`, `ExamSlot`, `AcademicCalendar`.
- Soft-delete semantics: delete operations typically set `is_active=false` or `deleted_at` instead of physical deletion; cascades ensure PDFs and questions are hidden from student views when a course is deleted.

### 4.4 Background tasks & AI

- PDF processing: uploaded PDFs are queued for AI processing which produces `summary`, `key_points`, and other metadata stored on `CoursePDF`.
- AI service wrapper likely in `backend/app/services/ai_service.py` (or similar) and is invoked asynchronously.

### 4.5 Security & roles

- Role-based dependencies (e.g., `get_admin_user`, `get_superadmin_user`) guard admin routes.
- Auth flows (JWT or session-based) handled by security utilities in `app/core/security.py` and `deps.py`.

---

## 5. Important workflows (how pieces interact)

1.  PDF upload → background processing
    - Frontend: `coursesApi.uploadPdf` posts a multipart form.
    - Backend: stores file, creates CoursePDF record, schedules processing job.
    - After processing, PDF record is updated with `is_processed`, `summary`, `key_points`.

2.  Feed generation & answering
    - Feed generation uses user progress and study-cycle to select questions.
    - Answer submission updates question stats and invalidates react-query feed caches; frontend triggers completion modal when no remaining questions.

3.  Question flagging and admin resolution
    - Student flags a question via `questionsApi.flag`.
    - Admin sees flags in `AdminPage` and can resolve, deactivate question, or bulk-resolve.

4.  Course deletion (admin)
    - Admin UI calls `coursesApi.deleteCourse`.
    - Backend marks course and related resources inactive. Frontend invalidates queries for `courses`, `feed`, and `study-cycle`.

---

## 6. Developer notes — how to run & debug

### Frontend (dev)

1.  Install deps: `cd frontend && npm install` (or `pnpm`/`yarn` depending on lockfile).
2.  Start dev server: `npm run dev` (Vite) — default port usually 5173.

### Backend (dev)

1.  Create Python venv and install requirements: `cd backend && python -m venv .venv && .venv\\Scripts\\activate && pip install -r requirements.txt`.
2.  Run with uvicorn: `uvicorn main:app --reload --port 8000`.
3.  Ensure MongoDB is reachable and env vars (DB URI, SECRET_KEY, AI credentials) are set.

### Docker

- Dockerfiles exist in `backend/Dockerfile` and `frontend/Dockerfile` for containerized builds. They can be used for production images.

---

## 7. Where to make common changes

- Add new API endpoint: backend `app/api/<domain>.py` → add Pydantic model in `app/models` → client wrapper in `frontend/src/api/index.ts` → react-query hook in page.
- Change study-cycle generation: backend `admin` endpoints provide stored cycle days; the frontend computes `smartCycle` client-side. For server-driven intelligence, implement ranking in backend in `app/services/study_cycle.py` and update `GET /admin/study-cycle`.

---

## 8. Suggestions & next improvements

- Move `smartCycle` scoring to the backend so study cycle can consider server-side metrics (weakest weeks, historical accuracy) and be consistent across clients.
- Add unit/integration tests for backend endpoints and critical frontend components.
- Add monitoring for background PDF processing and queue length.
- Implement an audit log for destructive admin actions (course deletion, bulk resolve).

---

## 9. Appendix: Key file quick map

- Frontend
  - [frontend/src/pages/HomePage.tsx](frontend/src/pages/HomePage.tsx) — feed, focused practice, completion modal
  - [frontend/src/pages/StudyPage.tsx](frontend/src/pages/StudyPage.tsx) — study-cycle UI (smartCycle logic)
  - [frontend/src/pages/CoursesPage.tsx](frontend/src/pages/CoursesPage.tsx) — course listing, PDF upload, delete
  - [frontend/src/pages/AdminPage.tsx](frontend/src/pages/AdminPage.tsx) — admin tools: exam timetable, study cycle, flags, users
  - [frontend/src/api/index.ts](frontend/src/api/index.ts) — API wrappers

- Backend
  - [backend/main.py](backend/main.py) — app startup
  - [backend/app/api/courses.py](backend/app/api/courses.py) — course endpoints (create/upload/delete)
  - [backend/app/api/admin.py](backend/app/api/admin.py) — admin endpoints (study-cycle, flags)
  - [backend/app/api/users.py](backend/app/api/users.py) — user profile

---

If you'd like, I can also:

- Generate a diagrams file (Mermaid) showing request flows (feed → answer → update), or
- Add unit tests scaffolding for the backend endpoints you care about, or
- Move `smartCycle` logic to the backend and wire it to `GET /admin/study-cycle` so the server returns prioritized days.

Tell me which follow-up you prefer and I'll create a plan and implement it.
