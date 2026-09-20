# app/api/courses.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, Literal
from bson import ObjectId
from datetime import datetime, timedelta
import os, uuid, re

from app.core.config import settings
from app.core.deps import get_current_user, get_admin_user
from app.core.database import courses_col, pdfs_col, questions_col, pdf_jobs_col
from app.services.ai_service import normalise_assessment_type, question_count_for
from app.services.study_cycle_service import refresh_study_cycle_for_term

router = APIRouter()

AssessmentType = Literal["mcq", "mixed", "theory", "essay"]


def _str_id(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id", ""))
    return doc


@router.get("/")
async def list_courses(
    level: Optional[str] = None,
    semester: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    q: dict = {"is_active": True}
    if level:    q["level"] = level
    if semester: q["semester"] = semester
    docs = await courses_col().find(q).to_list(None)
    if not docs:
        return []
    course_ids = [str(c["_id"]) for c in docs]

    # Three grouped queries for the whole page instead of 3 queries per course.
    # exclude soft-deleted PDFs from counts
    pdf_counts = {
        d["_id"]: d["count"]
        async for d in pdfs_col().aggregate([
            {"$match": {"course_id": {"$in": course_ids}, "is_deleted": {"$ne": True}}},
            {"$group": {"_id": "$course_id", "count": {"$sum": 1}}},
        ])
    }
    question_counts = {
        d["_id"]: d["count"]
        async for d in questions_col().aggregate([
            {"$match": {"course_id": {"$in": course_ids}, "is_active": True}},
            {"$group": {"_id": "$course_id", "count": {"$sum": 1}}},
        ])
    }
    weeks_by_course: dict[str, list[int]] = {}
    async for d in pdfs_col().aggregate([
        {
            "$match": {
                "course_id": {"$in": course_ids},
                "is_deleted": {"$ne": True},
                "week_number": {"$ne": None},
            }
        },
        {"$group": {"_id": "$course_id", "weeks": {"$addToSet": "$week_number"}}},
    ]):
        weeks_by_course[d["_id"]] = sorted(w for w in d.get("weeks", []) if w is not None)

    out = []
    for c in docs:
        cid = str(c["_id"])
        out.append({
            "id": cid,
            "code": c["code"],
            "title": c["title"],
            "level": c["level"],
            "semester": c["semester"],
            "credit_units": c.get("credit_units", 3),
            "assessment_type": normalise_assessment_type(c.get("assessment_type")),
            "pdf_count": pdf_counts.get(cid, 0),
            "question_count": question_counts.get(cid, 0),
            "weeks_uploaded": weeks_by_course.get(cid, []),
        })
    return out


class CourseCreate(BaseModel):
    code: str
    title: str
    level: str
    semester: int
    credit_units: int = 3
    assessment_type: AssessmentType = "mcq"


@router.post("/")
async def create_course(body: CourseCreate, admin: dict = Depends(get_admin_user)):
    if await courses_col().find_one({"code": body.code.upper()}):
        raise HTTPException(status_code=400, detail="Course code already exists")
    doc = body.dict()
    doc["code"] = doc["code"].upper()
    doc["assessment_type"] = normalise_assessment_type(doc.get("assessment_type"))
    doc["is_active"] = True
    result = await courses_col().insert_one(doc)
    try:
        await refresh_study_cycle_for_term(doc["level"], doc["semester"])
    except Exception:
        pass
    return {
        "id": str(result.inserted_id),
        "code": doc["code"],
        "title": doc["title"],
        "assessment_type": doc["assessment_type"],
    }


class CourseUpdate(BaseModel):
    assessment_type: AssessmentType


@router.patch("/{course_id}")
async def update_course(
    course_id: str,
    body: CourseUpdate,
    admin: dict = Depends(get_admin_user),
):
    """Update a course's assessment type (affects future PDF uploads)."""
    try:
        oid = ObjectId(course_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid course id")

    assessment_type = normalise_assessment_type(body.assessment_type)
    result = await courses_col().update_one(
        {"_id": oid, "is_active": True},
        {"$set": {"assessment_type": assessment_type}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"id": course_id, "assessment_type": assessment_type}


@router.delete("/{course_id}")
async def delete_course(
    course_id: str,
    admin: dict = Depends(get_admin_user),
):
    try:
        oid = ObjectId(course_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid course id")

    course = await courses_col().find_one({"_id": oid, "is_active": True})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    await courses_col().update_one({"_id": oid}, {"$set": {"is_active": False}})
    await pdfs_col().update_many(
        {"course_id": course_id, "is_deleted": {"$ne": True}},
        {"$set": {"is_deleted": True}},
    )
    await questions_col().update_many(
        {"course_id": course_id, "is_active": True},
        {"$set": {"is_active": False}},
    )

    try:
        await refresh_study_cycle_for_term(course["level"], course["semester"])
    except Exception:
        pass

    return {"message": "Course deleted"}


@router.get("/{course_id}/pdfs")
async def list_pdfs(course_id: str, current_user: dict = Depends(get_current_user)):
    # Never ship the full extracted lecture text (or on-disk paths) to the
    # client — this endpoint is polled while processing and the payload would
    # otherwise be megabytes per PDF.
    docs = (
        await pdfs_col()
        .find(
            {"course_id": course_id, "is_deleted": {"$ne": True}},
            {"extracted_text": 0, "file_path": 0, "filename": 0},
        )
        .sort("week_number", 1)
        .to_list(None)
    )
    pdf_ids = [str(doc["_id"]) for doc in docs]
    jobs_by_pdf_id = {}
    if pdf_ids:
        jobs = await pdf_jobs_col().find({"course_id": course_id, "pdf_id": {"$in": pdf_ids}}).to_list(None)
        jobs_by_pdf_id = {job["pdf_id"]: job for job in jobs}

    out = []
    for doc in docs:
        pdf = _str_id(doc)
        job = jobs_by_pdf_id.get(pdf["id"])
        if job:
            pdf["processing_status"] = job.get("status")
            pdf["processing_stage"] = job.get("stage")
            pdf["processing_error"] = job.get("last_error")
        out.append(pdf)
    return out


@router.post("/{course_id}/upload-pdf")
async def upload_pdf(
    course_id: str,
    week_number: Optional[int] = Form(None),
    is_course_material: bool = Form(False),
    file: UploadFile = File(...),
    admin: dict = Depends(get_admin_user),
):
    try:
        course_oid = ObjectId(course_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid course id")
    course = await courses_col().find_one({"_id": course_oid})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if not is_course_material and (week_number is None or not 1 <= week_number <= 20):
        raise HTTPException(status_code=400, detail="Week number must be between 1 and 20")
    if is_course_material:
        week_number = None

    # Essay/theory courses cap each assessment PDF at 5 open-ended questions;
    # MCQ courses keep the full 20-question bank.
    assessment_type = normalise_assessment_type(course.get("assessment_type"))
    question_count = question_count_for(assessment_type)

    content_type = (file.content_type or "").lower()
    if content_type not in {"application/pdf", "application/x-pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF files accepted")

    upload_dir = os.path.join(settings.UPLOAD_DIR, f"course_{course_id}", "course_material" if is_course_material else f"week_{week_number}")
    os.makedirs(upload_dir, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}_{file.filename}"
    file_path   = os.path.join(upload_dir, unique_name)

    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    bytes_written = 0
    header = b""
    try:
        with open(file_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                if not header:
                    header = chunk[:8]
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    raise HTTPException(status_code=400, detail=f"File exceeds {settings.MAX_FILE_SIZE_MB}MB")
                f.write(chunk)
    except HTTPException:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

    # Full 8-byte PDF magic-number check: %PDF-X.Y (e.g. %PDF-1.4)
    if not re.match(rb"%PDF-\d\.\d", header):
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail="Only valid PDF files accepted")

    # Idempotency guard: reject an accidental duplicate upload of the exact same
    # file for the same course/week while a previous copy is still queued or
    # processing. This prevents paying for the same PDF twice.
    existing = await pdfs_col().find_one({
        "course_id": course_id,
        "week_number": week_number,
        "is_course_material": is_course_material,
        "original_name": file.filename,
        "file_size": bytes_written,
        "is_deleted": {"$ne": True},
    })
    if existing:
        active_job = await pdf_jobs_col().find_one({
            "pdf_id": str(existing["_id"]),
            "status": {"$in": ["pending", "claimed", "processing"]},
        })
        if active_job:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(
                status_code=409,
                detail="This PDF is already queued or processing — no duplicate was created",
            )

    doc = {
        "course_id": course_id,
        "week_number": week_number,
        "is_course_material": is_course_material,
        "assessment_type": assessment_type,
        "filename": unique_name,
        "file_path": file_path,
        "original_name": file.filename,
        "file_size": bytes_written,
        "is_processed": False,
        "is_deleted": False,
        "created_at": datetime.utcnow(),
    }
    result = await pdfs_col().insert_one(doc)
    pdf_id = str(result.inserted_id)

    job_doc = {
        "job_type": "pdf_processing",
        "status": "pending",
        "attempt_count": 0,
        "max_attempts": 3,
        "question_count": question_count,
        "assessment_type": assessment_type,
        "course_id": course_id,
        "course_code": course["code"],
        "course_title": course["title"],
        "pdf_id": pdf_id,
        "week_number": week_number,
        "is_course_material": is_course_material,
        "file_path": file_path,
        "file_name": file.filename,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    job_result = await pdf_jobs_col().insert_one(job_doc)

    return {
        "id": pdf_id,
        "job_id": str(job_result.inserted_id),
        "message": "Course material uploaded — Nexus Core processing started" if is_course_material else "PDF uploaded — Nexus Core processing started",
        "week_number": week_number,
        "is_course_material": is_course_material,
        "assessment_type": assessment_type,
        "question_count": question_count,
    }


# ── Retry failed PDF processing ────────────────────────────────────────────
@router.post("/{course_id}/pdfs/{pdf_id}/retry")
async def retry_pdf_processing(
    course_id: str,
    pdf_id: str,
    admin: dict = Depends(get_admin_user),
):
    try:
        pdf_object_id = ObjectId(pdf_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF id")

    pdf = await pdfs_col().find_one({
        "_id": pdf_object_id,
        "course_id": course_id,
        "is_deleted": {"$ne": True},
    })
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    stale_cutoff = datetime.utcnow() - timedelta(seconds=settings.PDF_PROCESSING_TIMEOUT_SECONDS)
    # Retry a failed job, or reclaim one stranded by an interrupted worker. A
    # healthy in-flight job (recent processing_started_at) is intentionally left
    # alone so a stray retry click cannot trigger duplicate processing.
    result = await pdf_jobs_col().update_one(
        {
            "course_id": course_id,
            "pdf_id": pdf_id,
            "$or": [
                {"status": "failed"},
                {"status": {"$in": ["processing", "claimed"]}, "processing_started_at": {"$lte": stale_cutoff}},
                {"status": "pending", "updated_at": {"$lte": stale_cutoff}},
            ],
        },
        {"$set": {
            "status": "pending",
            "attempt_count": 0,
            "next_attempt_at": None,
            "last_error": None,
            "failed_at": None,
            "processing_started_at": None,
            "updated_at": datetime.utcnow(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=409,
            detail="This PDF is not available to retry",
        )

    # Mark unprocessed: the worker clears any partial questions before rebuilding.
    await pdfs_col().update_one(
        {"_id": pdf_object_id},
        {"$set": {"is_processed": False}},
    )

    return {"message": "PDF processing has been queued for retry", "status": "pending"}


# ── Soft-delete a PDF ──────────────────────────────────────────────────────
@router.delete("/{course_id}/pdfs/{pdf_id}")
async def delete_pdf(
    course_id: str,
    pdf_id: str,
    admin: dict = Depends(get_admin_user),
):
    result = await pdfs_col().update_one(
        {"_id": ObjectId(pdf_id), "course_id": course_id, "is_deleted": {"$ne": True}},
        {"$set": {"is_deleted": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="PDF not found")
    return {"message": "PDF deleted"}


# ── Edit PDF week number ───────────────────────────────────────────────────
class PdfWeekUpdate(BaseModel):
    week_number: int


class BatchDeleteRequest(BaseModel):
    pdf_ids: list[str]


@router.post("/{course_id}/pdfs/batch-delete")
async def batch_delete_pdfs(
    course_id: str,
    body: BatchDeleteRequest,
    admin: dict = Depends(get_admin_user),
):
    if not body.pdf_ids:
        raise HTTPException(status_code=400, detail="No PDF IDs provided")

    oids = []
    for pid in body.pdf_ids:
        try:
            oids.append(ObjectId(pid))
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid PDF id: {pid}")

    result = await pdfs_col().update_many(
        {"_id": {"$in": oids}, "course_id": course_id, "is_deleted": {"$ne": True}},
        {"$set": {"is_deleted": True}},
    )
    return {"message": f"{result.modified_count} PDF(s) deleted", "deleted_count": result.modified_count}


@router.patch("/{course_id}/pdfs/{pdf_id}/week")
async def update_pdf_week(
    course_id: str,
    pdf_id: str,
    body: PdfWeekUpdate,
    admin: dict = Depends(get_admin_user),
):
    if body.week_number < 1 or body.week_number > 20:
        raise HTTPException(status_code=400, detail="Week number must be between 1 and 20")
    result = await pdfs_col().update_one(
        {"_id": ObjectId(pdf_id), "course_id": course_id, "is_deleted": {"$ne": True}},
        {"$set": {"week_number": body.week_number}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="PDF not found")
    return {"message": "Week updated", "week_number": body.week_number}


@router.get("/{course_id}/questions")
async def list_questions(
    course_id: str,
    week_number: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    filt: dict = {"course_id": course_id, "is_active": True}
    if week_number:
        filt["week_number"] = week_number
    docs = await questions_col().find(filt).to_list(None)
    return [_str_id(d) for d in docs]
