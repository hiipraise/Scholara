from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from app.core.deps import get_current_user
from app.core.database import users_col

router = APIRouter()

VALID_LEVELS = {"100L", "200L", "300L", "400L", "500L"}

class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    level: Optional[str] = None
    semester: Optional[int] = Field(default=None, ge=1, le=2)

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = " ".join(value.strip().split())
        return cleaned or None

    @field_validator("level")
    @classmethod
    def validate_level(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip().upper()
        if normalized not in VALID_LEVELS:
            raise ValueError("Invalid academic level")
        return normalized

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
    updates = body.model_dump(exclude_unset=True, exclude_none=True)

    if updates:
        await users_col().update_one(
            {"email": current_user["email"]},
            {"$set": updates},
        )
    return {"message": "Profile updated", **updates}
