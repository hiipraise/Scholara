from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime
from bson import ObjectId
from app.core.deps import get_current_user
from app.core.database import questions_col, question_flags_col

router = APIRouter()


class FlagQuestionBody(BaseModel):
    reason: str | None = Field(default=None, max_length=300)

@router.get("/{question_id}")
async def get_question(
    question_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        q = await questions_col().find_one({"_id": ObjectId(question_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Question not found")
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    q["id"] = str(q.pop("_id"))
    return q


@router.post("/{question_id}/flag")
async def flag_question(
    question_id: str,
    body: FlagQuestionBody,
    current_user: dict = Depends(get_current_user),
):
    if not ObjectId.is_valid(question_id):
        raise HTTPException(status_code=404, detail="Question not found")

    question = await questions_col().find_one({"_id": ObjectId(question_id), "is_active": True})
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    now = datetime.utcnow()
    payload = {
        "user_id": current_user["id"],
        "user_email": current_user.get("email"),
        "question_id": question_id,
        "course_id": question.get("course_id"),
        "reason": (body.reason or "").strip() or None,
        "status": "open",
        "flagged_at": now,
        "updated_at": now,
    }
    await question_flags_col().update_one(
        {"user_id": current_user["id"], "question_id": question_id},
        {"$set": payload},
        upsert=True,
    )
    return {"ok": True, "question_id": question_id, "flagged": True}
