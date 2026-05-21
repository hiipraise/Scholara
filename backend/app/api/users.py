from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.deps import get_current_user
from app.core.database import users_col

router = APIRouter()

class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    level: Optional[str] = None
    semester: Optional[int] = None

def _s(u: dict) -> dict:
    u = dict(u)
    u["id"] = str(u.pop("_id", ""))
    u.pop("created_at", None)
    return u

@router.get("/me")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return _s(current_user)

@router.put("/me")
async def update_profile(
    body: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
):
    updates: dict = {}
    if body.full_name is not None:
        updates["full_name"] = body.full_name
    if body.level is not None:
        updates["level"] = body.level
    if body.semester is not None:
        updates["semester"] = body.semester

    if updates:
        await users_col().update_one(
            {"email": current_user["email"]},
            {"$set": updates},
        )
    return {"message": "Profile updated", **updates}
