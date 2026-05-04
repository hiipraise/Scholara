from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId

from app.core.deps import get_current_user
from app.core.database import courses_col, profiles_col, topics_col, formulas_col, notes_col

router = APIRouter()


@router.get("/courses/{course_id}/profile")
async def get_course_profile(course_id: str, current_user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    course = await courses_col().find_one({"_id": ObjectId(course_id), "is_active": True})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    profile = await profiles_col().find_one({"course_id": course_id}) or {}
    profile.pop("_id", None)
    return {
        "course_id": course_id,
        "course_code": course.get("code"),
        "course_title": course.get("title"),
        "profile": profile,
    }


@router.get("/courses/{course_id}/topics")
async def get_course_topics(course_id: str, current_user: dict = Depends(get_current_user)):
    docs = await topics_col().find({"course_id": course_id}).sort("topic", 1).to_list(None)
    return [{
        "id": str(d["_id"]),
        "topic": d.get("topic"),
        "subtopic": d.get("subtopic"),
        "learning_outcome": d.get("learning_outcome"),
        "importance_weight": d.get("importance_weight", 1.0),
        "source": d.get("source", "pdf"),
    } for d in docs]


@router.get("/courses/{course_id}/formulas")
async def get_course_formulas(course_id: str, current_user: dict = Depends(get_current_user)):
    docs = await formulas_col().find({"course_id": course_id}).sort("formula_name", 1).to_list(None)
    return [{
        "id": str(d["_id"]),
        "formula_name": d.get("formula_name"),
        "expression": d.get("expression"),
        "variables": d.get("variables", []),
        "units": d.get("units", []),
        "conditions": d.get("conditions", ""),
        "common_mistakes": d.get("common_mistakes", []),
        "worked_example": d.get("worked_example", ""),
    } for d in docs]


@router.get("/courses/{course_id}/deep-dive")
async def get_course_deep_dive(course_id: str, current_user: dict = Depends(get_current_user)):
    docs = await notes_col().find({"course_id": course_id}).sort("updated_at", -1).to_list(None)
    return [{
        "id": str(d["_id"]),
        "topic": d.get("topic"),
        "title": d.get("title"),
        "note": d.get("note"),
        "references": d.get("references", []),
    } for d in docs]
