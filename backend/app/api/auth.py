# app/api/auth.py
"""
Auth — email-only, no OTP, no password.
POST /api/auth/signin  →  { email } → creates user if new → returns JWT
GET  /api/auth/me      →  current user profile
PUT  /api/auth/email   →  change email (instant, no verify step)
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from datetime import datetime

from app.core.database import users_col
from app.core.security import create_access_token
from app.core.config import settings
from app.core.deps import get_current_user

router = APIRouter()


class SignInRequest(BaseModel):
    email: EmailStr


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr


def _role_for(email: str) -> str:
    return "superadmin" if email.lower() == settings.SUPERADMIN_EMAIL.lower() else "student"


def _serialize(user: dict) -> dict:
    user = dict(user)
    user["id"] = str(user.pop("_id", ""))
    user.pop("created_at", None)
    return user


@router.post("/signin")
async def sign_in(body: SignInRequest):
    """
    Email-only sign-in.
    If the email exists → return that account's JWT.
    If new → create account → return JWT.
    """
    email = body.email.lower().strip()
    col = users_col()

    user = await col.find_one({"email": email})
    if not user:
        doc = {
            "email": email,
            "full_name": None,
            "role": _role_for(email),
            "level": "100L",
            "semester": 1,
            "is_active": True,
            "created_at": datetime.utcnow(),
        }
        result = await col.insert_one(doc)
        user = await col.find_one({"_id": result.inserted_id})

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token({"email": email, "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _serialize(user),
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return _serialize(current_user)


@router.put("/email")
async def change_email(
    body: ChangeEmailRequest,
    current_user: dict = Depends(get_current_user),
):
    new_email = body.new_email.lower().strip()
    col = users_col()

    if await col.find_one({"email": new_email}):
        raise HTTPException(status_code=400, detail="Email already in use")

    await col.update_one(
        {"email": current_user["email"]},
        {"$set": {"email": new_email, "role": _role_for(new_email)}},
    )
    new_token = create_access_token({"email": new_email, "role": _role_for(new_email)})
    return {"message": "Email updated", "access_token": new_token, "new_email": new_email}
