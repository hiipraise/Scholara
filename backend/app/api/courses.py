# app/api/courses.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
from bson import ObjectId
from datetime import datetime
import os, uuid, re

from app.core.config import settings
from app.core.deps import get_current_user, get_admin_user
from app.core.database import courses_col, pdfs_col, questions_col, pdf_jobs_col
from app.services.study_cycle_service import refresh_study_cycle_for_term

router = APIRouter()


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

    out = []
    for c in docs:
        cid = str(c["_id"])
        # exclude soft-deleted PDFs from counts
        live_pdf_filter = {"course_id": cid, "is_deleted": {"$ne": True}}
        pdf_count  = await pdfs_col().count_documents(live_pdf_filter)
        q_count    = await questions_col().count_documents({"course_id": cid, "is_active": True})
        week_docs  = await pdfs_col().distinct("week_number", live_pdf_filter)
        out.append({
            "id": cid,
            "code": c["code"],
            "title": c["title"],
            "level": c["level"],
            "semester": c["semester"],
            "credit_units": c.get("credit_units", 3),
            "pdf_count": pdf_count,
            "question_count": q_count,
            "weeks_uploaded": sorted(week_docs),
        })
    return out


class CourseCreate(BaseModel):
    code: str
    title: str
    level: str
    semester: int
    credit_units: int = 3


@router.post("/")
async def create_course(body: CourseCreate, admin: dict = Depends(get_admin_user)):
    if await courses_col().find_one({"code": body.code.upper()}):
        raise HTTPException(status_code=400, detail="Course code already exists")
    doc = body.dict()
    doc["code"] = doc["code"].upper()
    doc["is_active"] = True
    result = await courses_col().insert_one(doc)
    try:
        await refresh_study_cycle_for_term(doc["level"], doc["semester"])
    except Exception:
        pass
    return {"id": str(result.inserted_id), "code": doc["code"], "title": doc["title"]}


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
    docs = (
        await pdfs_col()
        .find({"course_id": course_id, "is_deleted": {"$ne": True}})
        .sort("week_number", 1)
        .to_list(None)
    )
    return [_str_id(d) for d in docs]


@router.post("/{course_id}/upload-pdf")
async def upload_pdf(
    course_id: str,
    week_number: int = Form(...),
    file: UploadFile = File(...),
    admin: dict = Depends(get_admin_user),
):
    course = await courses_col().find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    content_type = (file.content_type or "").lower()
    if content_type not in {"application/pdf", "application/x-pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF files accepted")

    upload_dir = os.path.join(settings.UPLOAD_DIR, f"course_{course_id}", f"week_{week_number}")
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

    doc = {
        "course_id": course_id,
        "week_number": week_number,
        "filename": unique_name,
        "file_path": file_path,
        "original_name": file.filename,
        "file_size": bytes_written,
        "is_processed": False,
        "is_deleted": False,
    }
    result = await pdfs_col().insert_one(doc)
    pdf_id = str(result.inserted_id)

    job_doc = {
        "job_type": "pdf_processing",
        "status": "pending",
        "attempt_count": 0,
        "max_attempts": 3,
        "course_id": course_id,
        "course_code": course["code"],
        "course_title": course["title"],
        "pdf_id": pdf_id,
        "week_number": week_number,
        "file_path": file_path,
        "file_name": file.filename,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    job_result = await pdf_jobs_col().insert_one(job_doc)

    return {
        "id": pdf_id,
        "job_id": str(job_result.inserted_id),
        "message": "PDF uploaded — Nexus Core processing started",
        "week_number": week_number,
    }


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