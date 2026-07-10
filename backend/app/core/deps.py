# app/core/deps.py
"""
Dependency injection for FastAPI.
Handles authentication, authorization, and request validation.
"""
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import date
from typing import Optional
from bson import ObjectId
from app.core.security import decode_token
from app.core.database import users_col, calendars_col
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()


def _next_term(level: str, semester: int) -> tuple[str, int]:
    """Calculate next academic term."""
    if semester == 1:
        return level, 2
    current = int(level.replace("L", ""))
    return f"{current + 100}L", 1


def _parse_iso(value: str | None) -> date | None:
    """Parse ISO date string."""
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


async def _sync_academic_position(user: dict) -> dict:
    """
    Keep users on an active semester calendar.
    If the current semester ended, deactivate it and move the user
    to the next configured semester (if available).
    """
    level = user.get("level", "100L")
    semester = user.get("semester", 1)
    today = date.today()

    for _ in range(10):
        calendar = await calendars_col().find_one({"level": level, "semester": semester})
        if not calendar:
            break

        end_date = _parse_iso(calendar.get("semester_end_date"))
        if end_date and today > end_date:
            if calendar.get("is_active", True):
                await calendars_col().update_one(
                    {"_id": calendar["_id"]},
                    {"$set": {"is_active": False}},
                )
            level, semester = _next_term(level, semester)
            continue

        if not calendar.get("is_active", True):
            await calendars_col().update_one(
                {"_id": calendar["_id"]},
                {"$set": {"is_active": True}},
            )
        break

    if level != user.get("level") or semester != user.get("semester"):
        await users_col().update_one(
            {"_id": user["_id"]},
            {"$set": {"level": level, "semester": semester}},
        )
        user["level"] = level
        user["semester"] = semester

    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate current authenticated user from JWT token."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token, token_type="access")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email: str = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing email claim",
        )

    user = await users_col().find_one({"email": email.lower()})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    user = await _sync_academic_position(user)
    user["_id"] = str(user["_id"])
    user["id"] = str(user.get("_id"))

    return user


async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Verify current user has admin or superadmin role."""
    if current_user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def get_superadmin_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Verify current user has superadmin role."""
    if current_user.get("role") != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required",
        )
    return current_user


def validate_object_id(id_str: str) -> ObjectId:
    """Validate and convert string to MongoDB ObjectId. Prevents NoSQL injection."""
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ID format"
        )
