from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from app.core.deps import get_current_user
from app.core.database import questions_col

router = APIRouter()

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
