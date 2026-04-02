from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from bson import ObjectId
from datetime import datetime

from app.core.deps import get_current_user, get_admin_user, get_superadmin_user
from app.core.database import (
    exams_col, cycles_col, calendars_col,
    users_col, courses_col,
)

router = APIRouter()


def _s(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id", ""))
    doc.pop("created_at", None)
    return doc


# ── Exam Timetable ─────────────────────────────────────────────────────────

class ExamSlotIn(BaseModel):
    course_id: str
    exam_date: str
    start_time: str
    end_time: str
    venue: Optional[str] = None
    level: str = "100L"
    semester: int = 1


@router.get("/exam-timetable")
async def get_exam_timetable(
    level: str = "100L",
    semester: int = 1,
    current_user: dict = Depends(get_current_user),
):
    slots = await exams_col().find({"level": level, "semester": semester}).sort("exam_date", 1).to_list(None)
    out = []
    for s in slots:
        course = await courses_col().find_one({"_id": ObjectId(s["course_id"])})
        out.append({
            "id": str(s["_id"]),
            "course_id": s["course_id"],
            "course_code": course["code"] if course else "—",
            "course_title": course["title"] if course else "—",
            "exam_date": s["exam_date"],
            "start_time": s["start_time"],
            "end_time": s["end_time"],
            "venue": s.get("venue"),
            "level": s["level"],
            "semester": s["semester"],
        })
    return out


@router.post("/exam-timetable")
async def create_exam_slot(body: ExamSlotIn, admin: dict = Depends(get_admin_user)):
    result = await exams_col().insert_one({**body.dict(), "created_at": datetime.utcnow()})
    return {"id": str(result.inserted_id), "message": "Exam slot created"}


@router.delete("/exam-timetable/{slot_id}")
async def delete_exam_slot(slot_id: str, admin: dict = Depends(get_admin_user)):
    await exams_col().delete_one({"_id": ObjectId(slot_id)})
    return {"message": "Slot deleted"}


# ── Study Cycle ────────────────────────────────────────────────────────────

class StudyCycleIn(BaseModel):
    level: str
    semester: int
    days: List[dict]   # [{day_number: 1, course_ids: ["id1","id2"]}, ...]


@router.get("/study-cycle")
async def get_study_cycle(
    level: str = "100L",
    semester: int = 1,
    current_user: dict = Depends(get_current_user),
):
    docs = await cycles_col().find(
        {"level": level, "semester": semester}
    ).sort("day_number", 1).to_list(None)

    all_cids = set()
    for d in docs:
        all_cids.update(d.get("course_ids", []))

    courses_map: dict[str, dict] = {}
    for cid in all_cids:
        if ObjectId.is_valid(cid):
            c = await courses_col().find_one({"_id": ObjectId(cid)})
            if c:
                courses_map[cid] = {"id": cid, "code": c["code"], "title": c["title"]}

    return [
        {
            "day_number": d["day_number"],
            "courses": [courses_map[cid] for cid in d.get("course_ids", []) if cid in courses_map],
        }
        for d in docs
    ]


@router.put("/study-cycle")
async def update_study_cycle(body: StudyCycleIn, admin: dict = Depends(get_admin_user)):
    await cycles_col().delete_many({"level": body.level, "semester": body.semester})
    if body.days:
        await cycles_col().insert_many([
            {
                "level": body.level,
                "semester": body.semester,
                "day_number": d["day_number"],
                "course_ids": d.get("course_ids", []),
                "updated_at": datetime.utcnow(),
            }
            for d in body.days
        ])
    return {"message": f"Study cycle updated ({len(body.days)} days)"}


# ── Academic Calendar ──────────────────────────────────────────────────────

class CalendarIn(BaseModel):
    level: str
    semester: int
    school_resume_date: str
    lectures_start_date: str
    semester_end_date: Optional[str] = None


@router.get("/calendar")
async def get_calendars(current_user: dict = Depends(get_current_user)):
    docs = await calendars_col().find({}).sort([("level", 1), ("semester", 1)]).to_list(None)
    return [_s(d) for d in docs]


@router.post("/calendar")
async def create_calendar(body: CalendarIn, admin: dict = Depends(get_admin_user)):
    await calendars_col().update_one(
        {"level": body.level, "semester": body.semester},
        {"$set": {**body.dict(), "is_active": True, "created_at": datetime.utcnow()}},
        upsert=True,
    )
    return {"message": "Calendar saved"}


# ── Users (SuperAdmin only) ────────────────────────────────────────────────

class UserCreateIn(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    role: str = "student"
    level: str = "100L"
    semester: int = 1


class RoleUpdateIn(BaseModel):
    role: str


@router.get("/users")
async def list_users(superadmin: dict = Depends(get_superadmin_user)):
    docs = await users_col().find({}).sort("created_at", -1).to_list(None)
    return [_s(d) for d in docs]


@router.post("/users")
async def create_user(body: UserCreateIn, superadmin: dict = Depends(get_superadmin_user)):
    email = body.email.lower()
    if await users_col().find_one({"email": email}):
        raise HTTPException(status_code=400, detail="User already exists")
    doc = {**body.dict(), "email": email, "is_active": True, "created_at": datetime.utcnow()}
    result = await users_col().insert_one(doc)
    return {"id": str(result.inserted_id), "email": email}


@router.put("/users/{user_id}/role")
async def update_role(
    user_id: str,
    body: RoleUpdateIn,
    superadmin: dict = Depends(get_superadmin_user),
):
    await users_col().update_one({"_id": ObjectId(user_id)}, {"$set": {"role": body.role}})
    return {"message": f"Role updated to {body.role}"}


@router.put("/users/{user_id}/level")
async def update_level(
    user_id: str,
    level: str,
    semester: int,
    superadmin: dict = Depends(get_superadmin_user),
):
    await users_col().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"level": level, "semester": semester}},
    )
    return {"message": f"Level updated to {level} Semester {semester}"}


@router.delete("/users/{user_id}")
async def deactivate_user(user_id: str, superadmin: dict = Depends(get_superadmin_user)):
    await users_col().update_one({"_id": ObjectId(user_id)}, {"$set": {"is_active": False}})
    return {"message": "User deactivated"}
