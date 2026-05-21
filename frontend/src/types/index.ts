// src/types/index.ts
export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: "superadmin" | "admin" | "student";
  level: string;
  semester: number;
  is_active: boolean;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  level: string;
  semester: number;
  credit_units: number;
  pdf_count: number;
  question_count: number;
  weeks_uploaded: number[];
}

export interface QuestionFlag {
  question_id: string;
  flag_count: number;
  latest_flagged_at: string | null;
  reasons: string[];
  reporters: string[];
  status: "open" | "resolved";
  course_id: string | null;
  course_code: string;
  course_title: string;
  question_text: string;
  week_number: number | null;
  is_active: boolean;
}

export interface Question {
  id: string;
  course_id: string;
  week_number: number;
  question_text: string;
  question_type: "mcq" | "true_false";
  options: Record<string, string> | null;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  is_completed: boolean;
  correct_answer: string | null;
  explanation: string | null;
}

export interface DailyFeed {
  feed_date: string;
  questions: Question[];
  total: number;
  completed_count: number;
  is_fully_completed: boolean;
  progress_pct: number;
}

export interface AnswerResult {
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
  question_id: string;
}

export interface CoursePDF {
  id: string;
  week_number: number;
  original_name: string;
  is_processed: boolean;
  summary: string | null;
  key_points: string[] | null;
  key_formulas: string[] | null;
  created_at: string | null;
}

export interface WeekProgressItem {
  course_id: string;
  course_code: string;
  course_title: string;
  max_done_week: number;
  current_academic_week: number;
  unlocked_week: number;
  weeks_done: number[];
}

export interface FeedProgress {
  current_academic_week: number;
  courses: WeekProgressItem[];
}

export interface ExamSlot {
  id: string;
  course_id: string;
  course_code: string;
  course_title: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  venue: string | null;
  level: string;
  semester: number;
}

export interface StudyCycleDay {
  day_number: number;
  courses: { id: string; code: string; title: string }[];
}

export interface AcademicCalendar {
  id: string;
  level: string;
  semester: number;
  school_resume_date: string;
  lectures_start_date: string;
  semester_end_date: string | null;
  is_active: boolean;
}

export interface DailyHistoryItem {
  date: string;
  attempted: number;
  correct: number;
  incorrect: number;
  accuracy: number;
}

export interface WeakWeekInsight {
  course_id: string;
  course_code: string;
  course_title: string;
  week_number: number;
  attempts: number;
  correct: number;
  accuracy: number;
}

export interface FeedInsights {
  weakest_week: WeakWeekInsight | null;
  strongest_week: WeakWeekInsight | null;
  streak: {
    current: number;
    longest: number;
    missed_last_14_days: number;
  };
}

export interface CourseProfile {
  course_id: string;
  course_code: string;
  course_title: string;
  profile: {
    focus_label?: string;
    summary?: string;
    is_formula_heavy?: boolean;
    mix_targets?: { calculation: number; application: number; theory: number };
    difficulty_targets?: { easy: number; medium: number; hard: number };
    explanation_mode?: string;
    revision_priority?: string;
    study_tip?: string;
  };
}

export interface CourseTopic {
  id: string;
  topic: string;
  subtopic: string;
  learning_outcome: string;
  importance_weight: number;
  source: string;
}

export interface CourseFormula {
  id: string;
  formula_name: string;
  expression: string;
  variables: string[];
  units: string[];
  conditions: string;
  common_mistakes: string[];
  worked_example: string;
}

export interface CourseDeepDiveNote {
  id: string;
  topic: string;
  title: string;
  note: string;
  references: string[];
}

export interface PdfJobStatus {
  id: string;
  job_type: string;
  status: "pending" | "processing" | "done" | "failed";
  attempt_count: number;
  max_attempts: number;
  course_id: string;
  course_code: string;
  course_title: string;
  pdf_id: string;
  week_number: number;
  file_path: string;
  file_name: string;
  created_at: string | null;
  updated_at: string | null;
  last_attempt_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  last_error: string | null;
}

export interface PdfJobSummary {
  queue_depth: number;
  counts: {
    pending: number;
    processing: number;
    done: number;
    failed: number;
  };
  jobs: PdfJobStatus[];
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  action: string;
  target_id: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
