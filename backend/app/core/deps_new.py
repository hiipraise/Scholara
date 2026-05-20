# app/core/deps.py
"""
Dependency injection for FastAPI.
Handles authentication, authorization, and request validation.
"""
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthCredentials
from datetime import date
from typing import Optional, Callable
from bson import ObjectId
from app.core.security import decode_token
from app.core.database import users_col, calendars_col
from app.core.audit_logger import log_authorization
import logging

logger = logging.getLogger(__name__)

# Using HTTPBearer for cleaner header extraction
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


# ════════════════════════════════════════════════════════════════════════════════
# AUTHENTICATION DEPENDENCIES
# ════════════════════════════════════════════════════════════════════════════════

async def get_current_user(
    credentials: HTTPAuthCredentials = Depends(security),
    request: Request = None
) -> dict:
    """
    Extract and validate current authenticated user from JWT token.
    
    Returns:
        User document from database
        
    Raises:
        HTTPException 401: If token invalid or user not found
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    
    # Decode and validate token
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
    
    # Fetch user from database
    user = await users_col().find_one({"email": email.lower()})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    # Sync academic position if needed
    user = await _sync_academic_position(user)
    
    # Add ID for convenient access
    user["id"] = str(user.get("_id"))
    
    return user


async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Verify current user has admin or superadmin role.
    
    Returns:
        User document if authorized
        
    Raises:
        HTTPException 403: If user lacks admin role
    """
    if current_user.get("role") not in ["admin", "superadmin"]:
        log_authorization(
            current_user.get("id"),
            "admin_endpoint",
            "access",
            False
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    
    log_authorization(
        current_user.get("id"),
        "admin_endpoint",
        "access",
        True
    )
    
    return current_user


async def get_superadmin_user(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Verify current user has superadmin role.
    
    Returns:
        User document if authorized
        
    Raises:
        HTTPException 403: If user is not superadmin
    """
    if current_user.get("role") != "superadmin":
        log_authorization(
            current_user.get("id"),
            "superadmin_endpoint",
            "access",
            False
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required",
        )
    
    log_authorization(
        current_user.get("id"),
        "superadmin_endpoint",
        "access",
        True
    )
    
    return current_user


# ════════════════════════════════════════════════════════════════════════════════
# VALIDATION DEPENDENCIES
# ════════════════════════════════════════════════════════════════════════════════

def validate_object_id(id_str: str) -> ObjectId:
    """
    Validate and convert string to MongoDB ObjectId.
    Prevents NoSQL injection by validating format.
    
    Args:
        id_str: String representation of ObjectId
        
    Returns:
        Valid ObjectId object
        
    Raises:
        HTTPException 400: If invalid ObjectId format
    """
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ID format"
        )


async def validate_resource_ownership(
    resource_type: str,
    resource_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Generic resource ownership validation.
    Ensures user can only access their own resources (unless admin).
    """
    # Admins can access any resource
    if current_user.get("role") in ["admin", "superadmin"]:
        return current_user
    
    # For regular users, verify ownership (implement per-resource as needed)
    # This is a template - actual implementation depends on resource structure
    
    return current_user


# ════════════════════════════════════════════════════════════════════════════════
# RATE LIMIT CHECKER (Optional)
# ════════════════════════════════════════════════════════════════════════════════

async def check_rate_limit(
    request: Request,
    max_requests_per_minute: int = 60
) -> Request:
    """
    Check if request is within rate limits.
    Uses client IP as key.
    """
    from app.core.rate_limiter import api_rate_limiter
    
    client_ip = request.client.host if request.client else "unknown"
    
    allowed, remaining, reset_secs = await api_rate_limiter.is_allowed(
        f"api:{client_ip}",
        max_requests=max_requests_per_minute,
        window_minutes=1
    )
    
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {reset_secs} seconds",
            headers={"Retry-After": str(reset_secs)}
        )
    
    request.state.rate_limit_remaining = remaining
    request.state.rate_limit_reset = reset_secs
    
    return request
