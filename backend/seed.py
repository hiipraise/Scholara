"""
Seed script — populates MongoDB with Scholara initial data.
Run with:  python seed.py
"""
import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

COURSES = [
    {"code": "MTH101", "title": "Elementary Mathematics I",         "level": "100L", "semester": 1, "credit_units": 3},
    {"code": "COS101", "title": "Introduction to Computer Science", "level": "100L", "semester": 1, "credit_units": 3},
    {"code": "GST121", "title": "Use of English & Communication Skills I","level":"100L","semester":1,"credit_units":2},
    {"code": "STA111", "title": "Descriptive Statistics",           "level": "100L", "semester": 1, "credit_units": 3},
    {"code": "PHY101", "title": "General Physics I",                "level": "100L", "semester": 1, "credit_units": 3},
    {"code": "GST111", "title": "Philosophy & Logic",               "level": "100L", "semester": 1, "credit_units": 2},
    {"code": "PHY107", "title": "General Physics Practical I",      "level": "100L", "semester": 1, "credit_units": 1},
    {"code": "GST127", "title": "The Good Study Guide",             "level": "100L", "semester": 1, "credit_units": 2},
]

EXAM_TIMETABLE = [
    {"code": "COS101", "exam_date": "2026-04-07", "start_time": "09:00", "end_time": "11:00"},
    {"code": "GST111", "exam_date": "2026-04-07", "start_time": "13:00", "end_time": "15:00"},
    {"code": "MTH101", "exam_date": "2026-04-09", "start_time": "09:00", "end_time": "11:00"},
    {"code": "GST127", "exam_date": "2026-04-09", "start_time": "13:00", "end_time": "15:00"},
    {"code": "PHY101", "exam_date": "2026-04-10", "start_time": "09:00", "end_time": "11:00"},
    {"code": "STA111", "exam_date": "2026-04-11", "start_time": "09:00", "end_time": "11:00"},
    {"code": "GST121", "exam_date": "2026-04-11", "start_time": "13:00", "end_time": "15:00"},
    {"code": "PHY107", "exam_date": "2026-04-14", "start_time": "09:00", "end_time": "11:00"},
]

STUDY_CYCLE = [
    {"day_number": 1, "codes": ["MTH101", "COS101", "GST121"]},
    {"day_number": 2, "codes": ["STA111", "PHY101", "GST111"]},
    {"day_number": 3, "codes": ["PHY107", "GST127", "MTH101"]},
    {"day_number": 4, "codes": ["STA111", "GST121", "COS101"]},
    {"day_number": 5, "codes": ["PHY101", "GST111", "PHY107"]},
]


async def seed():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB]
    now = datetime.utcnow()

    # SuperAdmin
    if not await db.users.find_one({"email": settings.SUPERADMIN_EMAIL.lower()}):
        await db.users.insert_one({
            "email": settings.SUPERADMIN_EMAIL.lower(),
            "full_name": "Praise Chinedu",
            "role": "superadmin",
            "level": "100L",
            "semester": 1,
            "is_active": True,
            "created_at": now,
        })
        print("SuperAdmin created")

    # Courses — upsert by code
    code_to_id: dict[str, str] = {}
    for c in COURSES:
        result = await db.courses.find_one_and_update(
            {"code": c["code"]},
            {"$setOnInsert": {**c, "is_active": True, "created_at": now}},
            upsert=True,
            return_document=True,
        )
        code_to_id[c["code"]] = str(result["_id"])
    print(f"Courses: {len(code_to_id)} upserted")

    # Academic Calendar
    await db.academic_calendars.update_one(
        {"level": "100L", "semester": 1},
        {"$setOnInsert": {
            "level": "100L",
            "semester": 1,
            "school_resume_date": "2026-01-12",
            "lectures_start_date": "2026-01-19",
            "semester_end_date": "2026-04-30",
            "is_active": True,
            "created_at": now,
        }},
        upsert=True,
    )
    print("Academic calendar seeded")

    # Study Cycle
    for day in STUDY_CYCLE:
        cids = [code_to_id[c] for c in day["codes"] if c in code_to_id]
        await db.study_cycles.update_one(
            {"level": "100L", "semester": 1, "day_number": day["day_number"]},
            {"$setOnInsert": {
                "level": "100L", "semester": 1,
                "day_number": day["day_number"],
                "course_ids": cids,
                "updated_at": now,
            }},
            upsert=True,
        )
    print("Study cycle seeded")

    # Exam Timetable
    for e in EXAM_TIMETABLE:
        cid = code_to_id.get(e["code"])
        if not cid:
            continue
        await db.exam_slots.update_one(
            {"course_id": cid, "exam_date": e["exam_date"], "start_time": e["start_time"]},
            {"$setOnInsert": {
                "course_id": cid,
                "exam_date": e["exam_date"],
                "start_time": e["start_time"],
                "end_time": e["end_time"],
                "level": "100L",
                "semester": 1,
                "venue": None,
                "created_at": now,
            }},
            upsert=True,
        )
    print("Exam timetable seeded")

    # Indexes
    await db.users.create_index("email", unique=True)
    await db.courses.create_index("code", unique=True)
    await db.week_progress.create_index(
        [("user_id", 1), ("course_id", 1), ("week_number", 1)], unique=True)
    await db.daily_feeds.create_index(
        [("user_id", 1), ("feed_date", 1)], unique=True)
    await db.study_cycles.create_index(
        [("level", 1), ("semester", 1), ("day_number", 1)], unique=True)
    await db.academic_calendars.create_index(
        [("level", 1), ("semester", 1)], unique=True)
    print("Indexes ensured")

    client.close()
    print("\nSeed complete.")

if __name__ == "__main__":
    asyncio.run(seed())
