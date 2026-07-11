from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

_client: AsyncIOMotorClient | None = None

def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGODB_URL)
    return _client

def get_db():
    return get_client()[settings.MONGODB_DB]

# Collection accessors
def col(name: str):
    return get_db()[name]

# Named collections
def users_col():       return col("users")
def courses_col():     return col("courses")
def pdfs_col():        return col("course_pdfs")
def questions_col():   return col("questions")
def progress_col():    return col("week_progress")
def feeds_col():       return col("daily_feeds")
def attempts_col():    return col("question_attempts")
def question_flags_col(): return col("question_flags")
def question_suppressions_col(): return col("question_suppressions")
def model_feedback_col(): return col("model_feedback")
def exams_col():       return col("exam_slots")
def cycles_col():      return col("study_cycles")
def calendars_col():   return col("academic_calendars")
def profiles_col():    return col("course_profiles")
def topics_col():      return col("course_topics")
def formulas_col():    return col("course_formulas")
def notes_col():       return col("content_notes")
def pdf_jobs_col():    return col("pdf_jobs")
def audit_logs_col():  return col("audit_log")
def token_blacklist_col(): return col("token_blacklist")

async def create_indexes():
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.courses.create_index("code", unique=True)
    await db.course_pdfs.create_index([("course_id", 1), ("week_number", 1)])
    await db.questions.create_index([("course_id", 1), ("week_number", 1)])
    await db.week_progress.create_index([("user_id", 1), ("course_id", 1), ("week_number", 1)], unique=True)
    await db.daily_feeds.create_index([("user_id", 1), ("feed_date", 1)], unique=True)
    await db.question_attempts.create_index([("user_id", 1), ("question_id", 1), ("feed_date", 1)])
    await db.question_flags.create_index([("user_id", 1), ("question_id", 1)])
    await db.question_flags.create_index([("status", 1), ("flagged_at", -1)])
    await db.question_flags.create_index("question_id")
    await db.question_suppressions.create_index([("user_id", 1), ("question_id", 1)])
    await db.model_feedback.create_index([("status", 1), ("created_at", -1)])
    await db.exam_slots.create_index([("exam_date", 1), ("level", 1), ("semester", 1)])
    await db.study_cycles.create_index([("level", 1), ("semester", 1), ("day_number", 1)], unique=True)
    await db.academic_calendars.create_index([("level", 1), ("semester", 1)], unique=True)
    await db.course_profiles.create_index("course_id", unique=True)
    await db.course_topics.create_index([("course_id", 1), ("topic", 1), ("subtopic", 1)], unique=True)
    await db.course_formulas.create_index([("course_id", 1), ("formula_name", 1)], unique=True)
    await db.content_notes.create_index([("course_id", 1), ("topic", 1)])
    await db.pdf_jobs.create_index([("status", 1), ("updated_at", -1)])
    await db.pdf_jobs.create_index([("course_id", 1), ("pdf_id", 1)], unique=True)
    await db.audit_log.create_index([("timestamp", -1)])
    await db.audit_log.create_index([("actor_id", 1), ("timestamp", -1)])
    await db.token_blacklist.create_index("jti", unique=True)
    await db.token_blacklist.create_index("expires_at", expireAfterSeconds=0)
