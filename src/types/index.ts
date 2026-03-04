export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: 'superadmin' | 'admin' | 'student';
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

export interface Question {
  id: string;
  course_id: string;
  week_number: number;
  question_text: string;
  question_type: 'mcq' | 'true_false';
  options: Record<string, string> | null;
  difficulty: 'easy' | 'medium' | 'hard';
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
