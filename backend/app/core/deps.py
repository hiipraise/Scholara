# app/core/deps.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from datetime import date
from app.core.security import decode_token
from app.core.database import users_col, calendars_col

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/signin", auto_error=False)


def _next_term(level: str, semester: int) -> tuple[str, int]:
    if semester == 1:
        return level, 2
    current = int(level.replace("L", ""))
    return f"{current + 100}L", 1


def _parse_iso(value: str | None) -> date | None:
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

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Not authenticated",
                        headers={"WWW-Authenticate": "Bearer"})
    if not token:
        raise exc
    payload = decode_token(token)
    if not payload:
        raise exc
    user = await users_col().find_one({"email": payload.get("email")})
    if not user or not user.get("is_active", True):
        raise exc
    user = await _sync_academic_position(user)
    user["_id"] = str(user["_id"])
    user["id"] = user["_id"] 
    return user

async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_superadmin_user(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="SuperAdmin access required")
    return current_user
