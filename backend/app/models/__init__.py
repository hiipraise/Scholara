"""
MongoDB document schemas as Pydantic models.
Used for validation and serialisation — no ORM mapping needed.
"""
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Any
from datetime import datetime

class PyObjectId(str):
    pass

# ── User ──────────────────────────────────────────────────────────────────
class UserDoc(BaseModel):
    email: str
    full_name: Optional[str] = None
    role: str = "student"          # student | admin | superadmin
    level: str = "100L"            # 100L – 400L
    semester: int = 1
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ── Course ─────────────────────────────────────────────────────────────────
class CourseDoc(BaseModel):
    code: str
    title: str
    level: str
    semester: int
    credit_units: int = 3
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ── CoursePDF ──────────────────────────────────────────────────────────────
class CoursePDFDoc(BaseModel):
    course_id: str
    week_number: int
    filename: str
    file_path: str
    original_name: str
    file_size: int = 0
    is_processed: bool = False
    summary: Optional[str] = None
    key_points: Optional[List[str]] = None
    key_formulas: Optional[List[str]] = None
    processing_error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ── Question ───────────────────────────────────────────────────────────────
class QuestionDoc(BaseModel):
    course_id: str
    pdf_id: Optional[str] = None
    week_number: int
    question_text: str
    question_type: str = "mcq"
    options: Optional[dict] = None
    correct_answer: str
    explanation: Optional[str] = None
    difficulty: str = "medium"
    topic: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ── WeekProgress ───────────────────────────────────────────────────────────
class WeekProgressDoc(BaseModel):
    user_id: str
    course_id: str
    week_number: int
    is_done: bool = False
    marked_done_at: Optional[datetime] = None

# ── DailyFeed ──────────────────────────────────────────────────────────────
class DailyFeedDoc(BaseModel):
    user_id: str
    feed_date: str                 # YYYY-MM-DD
    question_ids: List[str] = []
    completed_ids: List[str] = []
    is_fully_completed: bool = False
    batch_number: int = 1
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# ── QuestionAttempt ────────────────────────────────────────────────────────
class QuestionAttemptDoc(BaseModel):
    user_id: str
    question_id: str
    selected_answer: str
    is_correct: bool
    feed_date: Optional[str] = None
    attempted_at: datetime = Field(default_factory=datetime.utcnow)

# ── ExamSlot ───────────────────────────────────────────────────────────────
class ExamSlotDoc(BaseModel):
    course_id: str
    exam_date: str                 # YYYY-MM-DD
    start_time: str
    end_time: str
    venue: Optional[str] = None
    level: str
    semester: int
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ── StudyCycle ─────────────────────────────────────────────────────────────
class StudyCycleDoc(BaseModel):
    level: str
    semester: int
    day_number: int
    course_ids: List[str] = []
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# ── AcademicCalendar ───────────────────────────────────────────────────────
class AcademicCalendarDoc(BaseModel):
    level: str
    semester: int
    school_resume_date: str        # YYYY-MM-DD
    lectures_start_date: str
    semester_end_date: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
