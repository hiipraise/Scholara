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

### Auth Flow (Passwordless)
1. User enters email
2. sessionStorage (no localStorage)
3. Role (superadmin/admin/student) determined by email on backend

### Key Pages
- `/auth` — Email
- `/` — Home Feed (60 daily questions with Progress Gate)
- `/courses` — Course list, PDF upload, AI summaries
- `/study` — Study Cycle timetable + Exam schedule
- `/profile` — Account management, email change
- `/admin` — Admin panel (exam timetable, study cycle, calendar, users)

### SuperAdmin Features
Email: `info.praisechinedu@gmail.com`
- Full user management
- Exam timetable CRUD
- Study cycle editor
- Academic calendar management
- Course creation

## Design System
- **Font Display:** Playfair Display
- **Font Body:** DM Sans
- **Font Mono:** JetBrains Mono
- **Primary BG:** `#212842` (Midnight Indigo)
- **Text/Accent:** `#F0E7D5` (Vanilla Cream)
- **Gold Accent:** `#c9a84c`
