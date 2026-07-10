# app/api/auth.py
"""
Password-based authentication with invite-code signup gating.
No email verification, no SMTP dependency.
Signup requires SIGNUP_INVITE_CODE env var (rotatable by redeploy).
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional
import logging

from app.core.database import users_col
from app.core.security import (
    create_access_token, create_refresh_token, decode_token,
)
from app.core.password import hash_password, verify_password, validate_password_strength
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limiter import auth_rate_limiter

logger = logging.getLogger(__name__)
router = APIRouter()


# ════════════════════════════════════════════════════════════════════════════
# REQUEST MODELS
# ════════════════════════════════════════════════════════════════════════════

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    invite_code: str = Field(..., min_length=1)
    full_name: Optional[str] = None


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    password: str


# ════════════════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════════════════

def _role_for(email: str) -> str:
    """Determine role: superadmin if email matches env var, otherwise student."""
    return "superadmin" if email.lower() == settings.SUPERADMIN_EMAIL.lower() else "student"


def _serialize_user(user: dict) -> dict:
    """Serialize user for API response — NEVER expose password_hash."""
    user = dict(user)
    user["id"] = str(user.pop("_id", ""))
    user.pop("password_hash", None)
    user.pop("created_at", None)
    return user


async def _get_user_by_email(email: str) -> Optional[dict]:
    col = users_col()
    return await col.find_one({"email": email.lower().strip()})


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@router.post("/signup")
async def sign_up(body: SignUpRequest):
    """
    Register a new account.
    Requires SIGNUP_INVITE_CODE (from env var) to match.
    On success, logs the user in immediately (returns tokens).
    """
    email = body.email.lower().strip()

    # Rate limit: 3 signup attempts per hour per email
    allowed, _, reset_secs = await auth_rate_limiter.is_allowed(
        f"signup:{email}", max_requests=3, window_minutes=60
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many signup attempts. Try again in {reset_secs} seconds."
        )

    # Validate invite code
    if body.invite_code.strip() != settings.SIGNUP_INVITE_CODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid invite code. Signup is by invitation only."
        )

    # Check existing user
    if await _get_user_by_email(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Password strength
    strength_errors = validate_password_strength(body.password)
    if strength_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password too weak: " + "; ".join(strength_errors)
        )

    # Hash password and create user
    password_hash = hash_password(body.password)
    col = users_col()

    user_doc = {
        "email": email,
        "full_name": body.full_name or None,
        "password_hash": password_hash,
        "role": _role_for(email),
        "level": "100L",
        "semester": 1,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_login": datetime.utcnow(),
    }

    try:
        result = await col.insert_one(user_doc)
        user = await col.find_one({"_id": result.inserted_id})
    except Exception as e:
        logger.error(f"Signup error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create account"
        )

    # Log in immediately
    token_data = {"email": email, "role": user["role"]}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"email": email})

    logger.info(f"New user registered: {email}")

    return {
        "message": "Account created successfully.",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": _serialize_user(user),
    }


@router.post("/signin")
async def sign_in(body: SignInRequest):
    """
    Sign in with email and password.
    Returns access token (15 min) + refresh token (7 days).
    """
    email = body.email.lower().strip()

    # Rate limit: 5 attempts per minute per email
    allowed, _, reset_secs = await auth_rate_limiter.is_allowed(
        f"signin:{email}",
        max_requests=settings.RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE,
        window_minutes=1,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {reset_secs} seconds."
        )

    user = await _get_user_by_email(email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated"
        )

    if not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Update last login
    col = users_col()
    await col.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )

    token_data = {"email": email, "role": user["role"]}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"email": email})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": _serialize_user(user),
    }


@router.post("/refresh")
async def refresh_access_token(body: RefreshTokenRequest):
    """Get a new access token using a refresh token."""
    payload = decode_token(body.refresh_token, token_type="refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    email = payload.get("email")
    user = await _get_user_by_email(email)
    if not user or not user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )

    token_data = {"email": email, "role": user["role"]}
    access_token = create_access_token(token_data)

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return _serialize_user(current_user)


@router.put("/password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    """Change password (requires old password verification)."""
    col = users_col()

    if not verify_password(body.old_password, current_user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )

    strength_errors = validate_password_strength(body.new_password)
    if strength_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password too weak: " + "; ".join(strength_errors)
        )

    new_hash = hash_password(body.new_password)
    await col.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"password_hash": new_hash}}
    )

    logger.info(f"Password changed: {current_user['email']}")
    return {"message": "Password updated successfully"}


@router.put("/email")
async def change_email(
    body: ChangeEmailRequest,
    current_user: dict = Depends(get_current_user),
):
    """Change email (requires password confirmation)."""
    if not verify_password(body.password, current_user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password is incorrect"
        )

    new_email = body.new_email.lower().strip()
    if new_email == current_user["email"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New email must be different"
        )

    col = users_col()
    from pymongo.errors import DuplicateKeyError
    try:
        result = await col.update_one(
            {"email": current_user["email"]},
            {"$set": {"email": new_email, "role": _role_for(new_email)}},
        )
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already in use"
        )

    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Account not found")

    new_token = create_access_token({"email": new_email, "role": _role_for(new_email)})
    new_refresh = create_refresh_token({"email": new_email})

    return {
        "message": "Email updated",
        "access_token": new_token,
        "refresh_token": new_refresh,
        "new_email": new_email,
    }


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout endpoint (token revocation is client-side)."""
    logger.info(f"User logged out: {current_user['email']}")
    return {"message": "Logged out successfully"}