from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from bson import ObjectId
from datetime import datetime, date

from app.core.deps import get_current_user, get_admin_user, get_superadmin_user
from app.core.database import (
    exams_col, cycles_col, calendars_col,
    users_col, courses_col, questions_col, question_flags_col,
)
from app.core.database import model_feedback_col
from app.services.study_cycle_service import refresh_study_cycle_for_term

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
    include_past: bool = False,
    current_user: dict = Depends(get_current_user),
):
    filt: dict = {"level": level, "semester": semester}
    if not include_past:
        filt["exam_date"] = {"$gte": date.today().isoformat()}
    slots = await exams_col().find(filt).sort("exam_date", 1).to_list(None)
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


async def _hydrate_cycle_docs(docs: list[dict]) -> list[dict]:
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
            "is_auto_generated": d.get("is_auto_generated", False),
        }
        for d in docs
    ]


async def _auto_generate_cycle(level: str, semester: int) -> list[dict]:
    return await refresh_study_cycle_for_term(level, semester)


@router.get("/study-cycle")
async def get_study_cycle(
    level: str = "100L",
    semester: int = 1,
    current_user: dict = Depends(get_current_user),
):
    docs = await cycles_col().find(
        {"level": level, "semester": semester}
    ).sort("day_number", 1).to_list(None)
    if not docs:
        docs = await _auto_generate_cycle(level, semester)
        docs = sorted(docs, key=lambda x: x["day_number"])

    return await _hydrate_cycle_docs(docs)

@router.get("/study-cycle/history")
async def get_study_cycle_history(current_user: dict = Depends(get_current_user)):
    docs = await cycles_col().find({}).sort([("level", 1), ("semester", 1), ("day_number", 1)]).to_list(None)
    grouped: dict[tuple[str, int], list[dict]] = {}
    for d in docs:
        key = (d.get("level", "100L"), d.get("semester", 1))
        grouped.setdefault(key, []).append(d)

    out = []
    for (level, semester), term_docs in grouped.items():
        hydrated = await _hydrate_cycle_docs(term_docs)
        out.append({"level": level, "semester": semester, "days": hydrated})
    out.sort(key=lambda x: (int(x["level"].replace("L", "")), x["semester"]))
    return out


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


class CalendarUpdateIn(BaseModel):
    school_resume_date: str
    lectures_start_date: str
    semester_end_date: Optional[str] = None


@router.get("/calendar")
async def get_calendars(current_user: dict = Depends(get_current_user)):
    docs = await calendars_col().find({}).sort([("level", 1), ("semester", 1)]).to_list(None)
    return [_s(d) for d in docs]


@router.post("/calendar")
async def create_calendar(body: CalendarIn, admin: dict = Depends(get_admin_user)):
    end_date = body.semester_end_date
    active = not end_date or end_date >= date.today().isoformat()
    await calendars_col().update_one(
        {"level": body.level, "semester": body.semester},
        {"$set": {**body.dict(), "is_active": active, "created_at": datetime.utcnow()}},
        upsert=True,
    )
    return {"message": "Calendar saved"}


@router.put("/calendar/{calendar_id}")
async def update_calendar(
    calendar_id: str,
    body: CalendarUpdateIn,
    admin: dict = Depends(get_admin_user),
):
    end_date = body.semester_end_date
    active = not end_date or end_date >= date.today().isoformat()
    result = await calendars_col().update_one(
        {"_id": ObjectId(calendar_id)},
        {"$set": {**body.dict(), "is_active": active}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Calendar entry not found")
    return {"message": "Calendar updated"}


@router.delete("/calendar/{calendar_id}")
async def delete_calendar(calendar_id: str, admin: dict = Depends(get_admin_user)):
    result = await calendars_col().delete_one({"_id": ObjectId(calendar_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Calendar entry not found")
    return {"message": "Calendar deleted"}



# ── Question Flags ───────────────────────────────────────────────────────────

class FlagResolveIn(BaseModel):
    deactivate_question: bool = False


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


@router.get("/question-flags")
async def list_question_flags(status: str = "open", admin: dict = Depends(get_admin_user)):
    match = {} if status == "all" else {"status": status}
    grouped = await question_flags_col().aggregate([
        {"$match": match},
        {
            "$group": {
                "_id": "$question_id",
                "flag_count": {"$sum": 1},
                "latest_flagged_at": {"$max": "$flagged_at"},
                "course_id": {"$first": "$course_id"},
                "reasons": {"$addToSet": "$reason"},
                "reporters": {"$addToSet": "$user_email"},
                "statuses": {"$addToSet": "$status"},
            }
        },
        {"$sort": {"latest_flagged_at": -1}},
    ]).to_list(None)

    out = []
    for item in grouped:
        question_id = item.get("_id")
        if not question_id or not ObjectId.is_valid(question_id):
            continue
        question = await questions_col().find_one({"_id": ObjectId(question_id)})
        course = None
        course_id = item.get("course_id")
        if course_id and ObjectId.is_valid(course_id):
            course = await courses_col().find_one({"_id": ObjectId(course_id)})

        out.append({
            "question_id": question_id,
            "flag_count": item.get("flag_count", 0),
            "latest_flagged_at": _iso(item.get("latest_flagged_at")),
            "reasons": [r for r in item.get("reasons", []) if r],
            "reporters": [r for r in item.get("reporters", []) if r],
            "status": "open" if "open" in item.get("statuses", []) else "resolved",
            "course_id": course_id,
            "course_code": course.get("code") if course else "—",
            "course_title": course.get("title") if course else "—",
            "question_text": question.get("question_text") if question else "Question deleted",
            "week_number": question.get("week_number") if question else None,
            "is_active": question.get("is_active", False) if question else False,
        })
    return out


@router.patch("/question-flags/{question_id}/resolve")
async def resolve_question_flags(
    question_id: str,
    body: FlagResolveIn,
    admin: dict = Depends(get_admin_user),
):
    if not ObjectId.is_valid(question_id):
        raise HTTPException(status_code=404, detail="Question not found")

    now = datetime.utcnow()
    result = await question_flags_col().update_many(
        {"question_id": question_id, "status": "open"},
        {"$set": {"status": "resolved", "resolved_at": now, "resolved_by": admin["id"], "updated_at": now}},
    )
    if body.deactivate_question:
        await questions_col().update_one({"_id": ObjectId(question_id)}, {"$set": {"is_active": False, "updated_at": now}})

    question = await questions_col().find_one({"_id": ObjectId(question_id)})
    if question:
        await model_feedback_col().update_many(
            {"question_id": question_id, "status": {"$ne": "archived"}},
            {"$set": {
                "course_id": question.get("course_id"),
                "question_text": question.get("question_text"),
                "status": "resolved",
                "resolved_at": now,
                "resolved_by": admin["id"],
                "deactivated": body.deactivate_question,
                "resolution_note": (
                    "Question was disabled after admin review." if body.deactivate_question
                    else "Question was reviewed and kept active."
                ),
                "updated_at": now,
            }, "$setOnInsert": {"created_at": now}},
        )

    return {
        "ok": True,
        "question_id": question_id,
        "resolved_count": result.modified_count,
        "deactivated": body.deactivate_question,
    }


@router.patch("/question-flags/resolve-all")
async def resolve_all_question_flags(
    body: FlagResolveIn,
    admin: dict = Depends(get_admin_user),
):
    now = datetime.utcnow()
    open_qids = await question_flags_col().distinct("question_id", {"status": "open"})
    valid_qids = [qid for qid in open_qids if isinstance(qid, str) and ObjectId.is_valid(qid)]

    if not valid_qids:
        return {
            "ok": True,
            "resolved_count": 0,
            "questions_touched": 0,
            "deactivated_count": 0,
            "deactivated": body.deactivate_question,
        }

    result = await question_flags_col().update_many(
        {"status": "open", "question_id": {"$in": valid_qids}},
        {"$set": {"status": "resolved", "resolved_at": now, "resolved_by": admin["id"], "updated_at": now}},
    )

    deactivated_count = 0
    if body.deactivate_question:
        question_oids = [ObjectId(qid) for qid in valid_qids]
        q_result = await questions_col().update_many(
            {"_id": {"$in": question_oids}, "is_active": True},
            {"$set": {"is_active": False, "updated_at": now}},
        )
        deactivated_count = q_result.modified_count

    await model_feedback_col().update_many(
        {"question_id": {"$in": valid_qids}, "status": {"$ne": "archived"}},
        {"$set": {
            "status": "resolved",
            "resolved_at": now,
            "resolved_by": admin["id"],
            "deactivated": body.deactivate_question,
            "resolution_note": (
                "Question was disabled after admin review." if body.deactivate_question
                else "Question was reviewed and kept active."
            ),
            "updated_at": now,
        }},
    )

    return {
        "ok": True,
        "resolved_count": result.modified_count,
        "questions_touched": len(valid_qids),
        "deactivated_count": deactivated_count,
        "deactivated": body.deactivate_question,
    }


@router.get("/model-feedback")
async def list_model_feedback(status: str = "pending", admin: dict = Depends(get_admin_user)):
    filt = {"status": status} if status != "all" else {}
    docs = await model_feedback_col().find(filt).sort("created_at", -1).to_list(None)
    out = []
    for d in docs:
        doc = dict(d)
        doc["id"] = str(doc.pop("_id"))
        out.append(doc)
    return out


@router.patch("/model-feedback/{feedback_id}/process")
async def process_model_feedback(feedback_id: str, action: str = "archive", admin: dict = Depends(get_admin_user)):
    # action: archive|escalate|apply
    result = await model_feedback_col().update_one({"_id": ObjectId(feedback_id)}, {"$set": {"status": action, "processed_at": datetime.utcnow(), "processed_by": admin["id"]}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Feedback item not found")
    return {"ok": True, "feedback_id": feedback_id, "action": action}

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
