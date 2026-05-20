# app/api/auth.py
"""
Enhanced authentication with:
- Password-based authentication (no more email-only)
- Email verification (prevents account takeover)
- Rate limiting (prevents brute force)
- Refresh tokens (short-lived access tokens)
- Audit logging (tracks security events)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional
import logging

from app.core.database import users_col
from app.core.security import (
    create_access_token, create_refresh_token, decode_token, verify_token_signature
)
from app.core.password import hash_password, verify_password, validate_password_strength
from app.core.email_verification import generate_email_verification_token, verify_email_token
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limiter import auth_rate_limiter
from app.core.audit_logger import log_authentication, log_security_event
from app.services.email_service import send_verification_email  # Will create this

logger = logging.getLogger(__name__)
router = APIRouter()


# ════════════════════════════════════════════════════════════════════════════════
# REQUEST/RESPONSE MODELS
# ════════════════════════════════════════════════════════════════════════════════

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    token: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordConfirmRequest(BaseModel):
    email: EmailStr
    token: str
    new_password: str = Field(..., min_length=8)


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


# ════════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ════════════════════════════════════════════════════════════════════════════════

def _role_for(email: str) -> str:
    """Determine user role based on email."""
    return "superadmin" if email.lower() == settings.SUPERADMIN_EMAIL.lower() else "student"


def _serialize_user(user: dict) -> dict:
    """Serialize user document for API response."""
    user = dict(user)
    user["id"] = str(user.pop("_id", ""))
    user.pop("password_hash", None)  # Never expose password
    user.pop("created_at", None)
    user.pop("email_verification_token", None)
    user.pop("email_verification_token_expires", None)
    return user


async def _get_user_by_email(email: str) -> Optional[dict]:
    """Fetch user by email from database."""
    col = users_col()
    return await col.find_one({"email": email.lower().strip()})


async def _user_exists(email: str) -> bool:
    """Check if user with email already exists."""
    user = await _get_user_by_email(email)
    return user is not None


# ════════════════════════════════════════════════════════════════════════════════
# AUTHENTICATION ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════════

@router.post("/signup", response_model=dict)
async def sign_up(body: SignUpRequest):
    """
    Register new user account.
    
    Flow:
    1. Validate email not already registered
    2. Validate password strength
    3. Hash password with bcrypt
    4. Generate email verification token
    5. Send verification email
    6. Create user account (email_verified=False)
    """
    email = body.email.lower().strip()
    
    # Rate limiting
    allowed, remaining, reset_secs = await auth_rate_limiter.is_allowed(
        f"signup:{email}",
        max_requests=3,
        window_minutes=60
    )
    if not allowed:
        log_security_event("signup_rate_limit_exceeded", {"email": email})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many signup attempts. Try again in {reset_secs} seconds"
        )
    
    # Check if email already registered
    if await _user_exists(email):
        log_security_event("signup_email_already_exists", {"email": email})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Validate password strength
    strength_errors = validate_password_strength(body.password)
    if strength_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password too weak: " + "; ".join(strength_errors)
        )
    
    # Hash password
    password_hash = hash_password(body.password)
    
    # Generate email verification token
    verification_token, token_expires = generate_email_verification_token(
        email,
        settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES
    )
    
    # Create user document
    col = users_col()
    user_doc = {
        "email": email,
        "full_name": body.full_name or None,
        "password_hash": password_hash,
        "role": _role_for(email),
        "level": "100L",
        "semester": 1,
        "is_active": True,
        "email_verified": False,
        "email_verification_token": verification_token,
        "email_verification_token_expires": token_expires,
        "created_at": datetime.utcnow(),
        "last_login": None,
    }
    
    try:
        result = await col.insert_one(user_doc)
        logger.info(f"New user registered: {email}")
        
        # Send verification email
        try:
            await send_verification_email(email, verification_token)
        except Exception as e:
            logger.error(f"Failed to send verification email: {e}")
            # Don't fail signup, user can request resend
        
        return {
            "message": "Account created. Check your email to verify.",
            "email": email,
            "email_verified": False
        }
    except Exception as e:
        logger.error(f"Signup error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create account"
        )


@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest):
    """Verify email address using token sent to email."""
    email = body.email.lower().strip()
    col = users_col()
    
    user = await _get_user_by_email(email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.get("email_verified"):
        return {"message": "Email already verified"}
    
    # Verify token
    if not verify_email_token(
        body.token,
        email,
        user.get("email_verification_token_expires")
    ):
        log_security_event("email_verification_failed", {"email": email, "reason": "invalid_token"})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )
    
    # Mark email as verified
    await col.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "email_verified": True,
                "email_verification_token": None,
                "email_verification_token_expires": None,
            }
        }
    )
    
    logger.info(f"Email verified: {email}")
    return {"message": "Email verified successfully"}


@router.post("/signin", response_model=AuthResponse)
async def sign_in(body: SignInRequest):
    """
    Sign in with email and password.
    
    Returns both access token (short-lived) and refresh token (long-lived).
    """
    email = body.email.lower().strip()
    ip = ""  # TODO: Extract from request
    
    # Rate limiting (strict for auth)
    allowed, remaining, reset_secs = await auth_rate_limiter.is_allowed(
        f"signin:{email}",
        max_requests=settings.RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE,
        window_minutes=1
    )
    if not allowed:
        log_security_event("signin_rate_limit_exceeded", {"email": email, "ip": ip})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {reset_secs} seconds"
        )
    
    # Get user
    user = await _get_user_by_email(email)
    if not user:
        log_authentication(email, False, "user_not_found", ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check if email verified
    if not user.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Check your email for verification link."
        )
    
    # Check if active
    if not user.get("is_active"):
        log_authentication(email, False, "account_deactivated", ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated"
        )
    
    # Verify password
    if not verify_password(body.password, user.get("password_hash", "")):
        log_authentication(email, False, "invalid_password", ip)
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
    
    # Create tokens
    token_data = {"email": email, "role": user["role"]}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"email": email})
    
    log_authentication(email, True, "successful_signin", ip)
    
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_serialize_user(user)
    )


@router.post("/refresh")
async def refresh_access_token(body: RefreshTokenRequest):
    """Get new access token using refresh token."""
    payload = decode_token(body.refresh_token, token_type="refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    email = payload.get("email")
    user = await _get_user_by_email(email)
    if not user or not user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    # Create new access token
    token_data = {"email": email, "role": user["role"]}
    access_token = create_access_token(token_data)
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me")
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return _serialize_user(current_user)


@router.put("/password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    """Change user password."""
    col = users_col()
    
    # Verify old password
    if not verify_password(body.old_password, current_user.get("password_hash", "")):
        log_security_event("password_change_failed", {
            "user_id": str(current_user["_id"]),
            "reason": "invalid_old_password"
        })
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    strength_errors = validate_password_strength(body.new_password)
    if strength_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password too weak: " + "; ".join(strength_errors)
        )
    
    # Hash and update
    new_hash = hash_password(body.new_password)
    await col.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    logger.info(f"Password changed: {current_user['email']}")
    return {"message": "Password updated successfully"}


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """
    Logout endpoint (token revocation handled client-side).
    In production, implement token blacklist or use short expiries.
    """
    logger.info(f"User logged out: {current_user['email']}")
    return {"message": "Logged out successfully"}
