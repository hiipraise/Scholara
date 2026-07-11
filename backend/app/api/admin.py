from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from bson import ObjectId
from datetime import datetime, date
import math
import logging

from app.core.deps import get_current_user, get_admin_user, get_superadmin_user
from app.core.database import (
    exams_col, cycles_col, calendars_col,
    users_col, courses_col, questions_col, question_flags_col, pdf_jobs_col, audit_logs_col,
)
from app.services.audit_service import log_audit

logger = logging.getLogger(__name__)
from app.core.database import model_feedback_col
from app.services.study_cycle_service import (
    refresh_study_cycle_for_term,
    hydrate_ranked_cycle_docs,
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
    slot_id = str(result.inserted_id)
    await log_audit(
        actor_id=admin["id"], actor_email=admin.get("email", ""),
        action="exam.create", target_type="exam_slot", target_id=slot_id,
        details={"course_id": body.course_id, "exam_date": body.exam_date, "level": body.level, "semester": body.semester},
    )
    return {"id": slot_id, "message": "Exam slot created"}


@router.delete("/exam-timetable/{slot_id}")
async def delete_exam_slot(slot_id: str, admin: dict = Depends(get_admin_user)):
    # Fetch before delete to capture details for audit
    slot = await exams_col().find_one({"_id": ObjectId(slot_id)})
    await exams_col().delete_one({"_id": ObjectId(slot_id)})
    await log_audit(
        actor_id=admin["id"], actor_email=admin.get("email", ""),
        action="exam.delete", target_type="exam_slot", target_id=slot_id,
        details={"course_id": slot.get("course_id") if slot else None, "exam_date": slot.get("exam_date") if slot else None} if slot else None,
    )
    return {"message": "Slot deleted"}


# ── Study Cycle ────────────────────────────────────────────────────────────

class StudyCycleIn(BaseModel):
    level: str
    semester: int
    days: List[dict]   # [{day_number: 1, course_ids: ["id1","id2"]}, ...]


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

    return await hydrate_ranked_cycle_docs(docs, level, semester)

@router.get("/study-cycle/history")
async def get_study_cycle_history(current_user: dict = Depends(get_current_user)):
    docs = await cycles_col().find({}).sort([("level", 1), ("semester", 1), ("day_number", 1)]).to_list(None)
    grouped: dict[tuple[str, int], list[dict]] = {}
    for d in docs:
        key = (d.get("level", "100L"), d.get("semester", 1))
        grouped.setdefault(key, []).append(d)

    out = []
    for (level, semester), term_docs in grouped.items():
        hydrated = await hydrate_ranked_cycle_docs(term_docs, level, semester)
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
    await log_audit(
        actor_id=admin["id"], actor_email=admin.get("email", ""),
        action="study_cycle.update", target_type="study_cycle",
        details={"level": body.level, "semester": body.semester, "day_count": len(body.days)},
    )
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
    await log_audit(
        actor_id=admin["id"], actor_email=admin.get("email", ""),
        action="calendar.create", target_type="calendar",
        details={"level": body.level, "semester": body.semester, "resume_date": body.school_resume_date, "end_date": end_date},
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
    await log_audit(
        actor_id=admin["id"], actor_email=admin.get("email", ""),
        action="calendar.update", target_type="calendar", target_id=calendar_id,
        details={"resume_date": body.school_resume_date, "end_date": end_date},
    )
    return {"message": "Calendar updated"}


@router.delete("/calendar/{calendar_id}")
async def delete_calendar(calendar_id: str, admin: dict = Depends(get_admin_user)):
    # Fetch before delete for audit details
    cal = await calendars_col().find_one({"_id": ObjectId(calendar_id)})
    result = await calendars_col().delete_one({"_id": ObjectId(calendar_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Calendar entry not found")
    await log_audit(
        actor_id=admin["id"], actor_email=admin.get("email", ""),
        action="calendar.delete", target_type="calendar", target_id=calendar_id,
        details={"level": cal.get("level") if cal else None, "semester": cal.get("semester") if cal else None} if cal else None,
    )
    return {"message": "Calendar deleted"}



# ── Question Flags ───────────────────────────────────────────────────────────

class FlagResolveIn(BaseModel):
    deactivate_question: bool = False


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _audit(doc: dict) -> dict:
    out = dict(doc)
    out["id"] = str(out.pop("_id", ""))
    if out.get("timestamp") is not None:
        out["timestamp"] = _iso(out["timestamp"])
    return out


def _job_doc(doc: dict) -> dict:
    out = dict(doc)
    out["id"] = str(out.pop("_id", ""))
    for key in ("created_at", "updated_at", "last_attempt_at", "completed_at", "failed_at"):
        if key in out and out[key] is not None:
            out[key] = _iso(out[key])
    return out


@router.get("/jobs")
async def list_jobs(admin: dict = Depends(get_admin_user)):
    docs = await pdf_jobs_col().find({}).sort([("updated_at", -1), ("created_at", -1)]).to_list(100)
    counts = {"pending": 0, "processing": 0, "done": 0, "failed": 0}
    for doc in docs:
        status = doc.get("status", "pending")
        if status in counts:
            counts[status] += 1
    return {
        "queue_depth": counts["pending"] + counts["processing"],
        "counts": counts,
        "jobs": [_job_doc(doc) for doc in docs],
    }


@router.get("/audit-logs")
async def list_audit_logs(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=200),
    admin: dict = Depends(get_superadmin_user),
):
    skip = (page - 1) * size
    total = await audit_logs_col().count_documents({})
    docs = (
        await audit_logs_col()
        .find({})
        .sort("timestamp", -1)
        .skip(skip)
        .limit(size)
        .to_list(size)
    )
    return {
        "items": [_audit(doc) for doc in docs],
        "total": total,
        "page": page,
        "size": size,
        "pages": math.ceil(total / size) if total else 0,
    }


@router.get("/question-flags")
async def list_question_flags(
    status: str = "open",
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=200),
    admin: dict = Depends(get_admin_user),
):
    match = {} if status == "all" else {"status": status}
    skip = (page - 1) * size

    # Use $facet to get paginated results + total count in one aggregation
    facet_result = await question_flags_col().aggregate([
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
        {
            "$facet": {
                "paginated": [
                    {"$skip": skip},
                    {"$limit": size},
                ],
                "total": [
                    {"$count": "count"},
                ],
            }
        },
    ]).to_list(None)

    grouped = facet_result[0]["paginated"] if facet_result else []
    total_count = facet_result[0]["total"][0]["count"] if facet_result and facet_result[0]["total"] else 0

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
            "status": "open" if "open" in item.get("statuses", []) else "resolved",
            "course_id": course_id,
            "course_code": course.get("code") if course else "—",
            "course_title": course.get("title") if course else "—",
            "question_text": question.get("question_text") if question else "Question deleted",
            "week_number": question.get("week_number") if question else None,
            "is_active": question.get("is_active", False) if question else False,
        })

    return {
        "items": out,
        "total": total_count,
        "page": page,
        "size": size,
        "pages": math.ceil(total_count / size) if total_count else 0,
    }


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

    await log_audit(
        actor_id=admin["id"], actor_email=admin.get("email", ""),
        action="flag.resolve", target_type="question", target_id=question_id,
        details={"resolved_count": result.modified_count, "deactivated": body.deactivate_question,
                  "course_id": question.get("course_id") if question else None},
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
        await log_audit(
            actor_id=admin["id"], actor_email=admin.get("email", ""),
            action="flag.resolve_all", target_type="question",
            details={"resolved_count": 0, "deactivated": body.deactivate_question},
        )
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

    await log_audit(
        actor_id=admin["id"], actor_email=admin.get("email", ""),
        action="flag.resolve_all", target_type="question",
        details={"resolved_count": result.modified_count, "questions_touched": len(valid_qids),
                  "deactivated_count": deactivated_count, "deactivated": body.deactivate_question},
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
    # Fetch feedback before update for audit details
    fb = await model_feedback_col().find_one({"_id": ObjectId(feedback_id)}, {"question_id": 1, "status": 1})
    result = await model_feedback_col().update_one({"_id": ObjectId(feedback_id)}, {"$set": {"status": action, "processed_at": datetime.utcnow(), "processed_by": admin["id"]}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Feedback item not found")
    await log_audit(
        actor_id=admin["id"], actor_email=admin.get("email", ""),
        action="feedback.process", target_type="feedback", target_id=feedback_id,
        details={"previous_status": fb.get("status") if fb else None, "new_status": action, "question_id": fb.get("question_id") if fb else None},
    )
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
async def list_users(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=200),
    superadmin: dict = Depends(get_superadmin_user),
):
    skip = (page - 1) * size
    total = await users_col().count_documents({})
    docs = (
        await users_col()
        .find({})
        .sort("created_at", -1)
        .skip(skip)
        .limit(size)
        .to_list(size)
    )
    return {
        "items": [_s(d) for d in docs],
        "total": total,
        "page": page,
        "size": size,
        "pages": math.ceil(total / size) if total else 0,
    }


@router.post("/users")
async def create_user(body: UserCreateIn, superadmin: dict = Depends(get_superadmin_user)):
    email = body.email.lower()
    if await users_col().find_one({"email": email}):
        raise HTTPException(status_code=400, detail="User already exists")
    doc = {**body.dict(), "email": email, "is_active": True, "created_at": datetime.utcnow()}
    result = await users_col().insert_one(doc)
    user_id = str(result.inserted_id)
    await log_audit(
        actor_id=superadmin["id"], actor_email=superadmin.get("email", ""),
        action="user.create", target_type="user", target_id=user_id,
        details={"email": email, "role": body.role, "level": body.level, "semester": body.semester},
    )
    return {"id": user_id, "email": email}


@router.put("/users/{user_id}/role")
async def update_role(
    user_id: str,
    body: RoleUpdateIn,
    superadmin: dict = Depends(get_superadmin_user),
):
    # Fetch old role for audit
    user = await users_col().find_one({"_id": ObjectId(user_id)}, {"role": 1, "email": 1})
    old_role = user.get("role") if user else None
    await users_col().update_one({"_id": ObjectId(user_id)}, {"$set": {"role": body.role}})
    await log_audit(
        actor_id=superadmin["id"], actor_email=superadmin.get("email", ""),
        action="user.role_change", target_type="user", target_id=user_id,
        details={"user_email": user.get("email") if user else None, "from": old_role, "to": body.role},
    )
    return {"message": f"Role updated to {body.role}"}


@router.put("/users/{user_id}/level")
async def update_level(
    user_id: str,
    level: str,
    semester: int,
    superadmin: dict = Depends(get_superadmin_user),
):
    # Fetch old level for audit
    user = await users_col().find_one({"_id": ObjectId(user_id)}, {"level": 1, "semester": 1, "email": 1})
    old_level = f"{user.get('level')} Semester {user.get('semester')}" if user else None
    await users_col().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"level": level, "semester": semester}},
    )
    await log_audit(
        actor_id=superadmin["id"], actor_email=superadmin.get("email", ""),
        action="user.level_change", target_type="user", target_id=user_id,
        details={"user_email": user.get("email") if user else None, "from": old_level, "to": f"{level} Semester {semester}"},
    )
    return {"message": f"Level updated to {level} Semester {semester}"}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    superadmin: dict = Depends(get_superadmin_user),
):
    """
    SuperAdmin-only: Reset a user's password to a strong random value.
    Returns the new plaintext password (must be shared securely out-of-band).
    """
    import secrets
    from app.core.password import hash_password

    user = await users_col().find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Generate a strong 20-char random password
    new_password = secrets.token_urlsafe(15)  # 20 chars, url-safe
    password_hash = hash_password(new_password)

    await users_col().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "password_hash": password_hash,
            "must_change_password": True,
        }},
    )

    logger.info(f"Password reset for {user.get('email')} by superadmin {superadmin['email']}")

    await log_audit(
        actor_id=superadmin["id"], actor_email=superadmin.get("email", ""),
        action="user.password_reset", target_type="user", target_id=user_id,
        details={"user_email": user.get("email")},
    )

    return {
        "message": "Password reset successfully. Share the new password securely.",
        "user_id": user_id,
        "new_password": new_password,
    }


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    superadmin: dict = Depends(get_superadmin_user),
):
    user = await users_col().find_one({"_id": ObjectId(user_id)})
    await users_col().update_one({"_id": ObjectId(user_id)}, {"$set": {"is_active": False}})
    await log_audit(
        actor_id=superadmin["id"], actor_email=superadmin.get("email", ""),
        action="user.deactivate", target_type="user", target_id=user_id,
        details={"user_email": user.get("email") if user else None},
    )
    return {"message": "User deactivated"}
