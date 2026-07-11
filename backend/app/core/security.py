# app/core/security.py
"""
JWT token generation and validation.
Supports short-lived access tokens + long-lived refresh tokens.
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from app.core.config import settings
import secrets
import logging

logger = logging.getLogger(__name__)


def _generate_jti() -> str:
    """Generate a unique JWT ID for token tracking and blacklisting."""
    return secrets.token_urlsafe(16)


def _token_expiry(expires_delta: Optional[timedelta] = None, default_minutes: int = 15) -> datetime:
    if expires_delta:
        return datetime.utcnow() + expires_delta
    return datetime.utcnow() + timedelta(minutes=default_minutes)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a short-lived JWT access token (default 15 minutes) with unique jti."""
    to_encode = data.copy()
    expire = _token_expiry(expires_delta, settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "jti": _generate_jti(),
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access",
    })
    try:
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    except Exception as e:
        logger.error(f"Failed to create access token: {e}")
        raise


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a long-lived JWT refresh token (default 7 days) with unique jti."""
    to_encode = data.copy()
    expire = _token_expiry(expires_delta, settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60)
    to_encode.update({
        "jti": _generate_jti(),
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh",
    })
    try:
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    except Exception as e:
        logger.error(f"Failed to create refresh token: {e}")
        raise


def decode_token(token: str, token_type: str = "access") -> Optional[Dict[str, Any]]:
    """Decode and validate JWT token. Checks token type matches expected."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != token_type:
            logger.warning(f"Token type mismatch: expected {token_type}, got {payload.get('type')}")
            return None
        return payload
    except JWTError:
        return None
    except Exception as e:
        logger.error(f"Token decode error: {e}")
        return None


async def is_token_blacklisted(payload: dict) -> bool:
    """Check if a decoded token's jti is blacklisted (e.g. after password change)."""
    jti = payload.get("jti")
    if not jti:
        return False  # tokens without jti are not tracked
    from app.core.database import token_blacklist_col
    entry = await token_blacklist_col().find_one({"jti": jti}, {"_id": 1})
    return entry is not None


async def blacklist_token(payload: dict) -> None:
    """Add a token's jti to the blacklist so it can no longer be used."""
    jti = payload.get("jti")
    exp = payload.get("exp")
    if not jti:
        return
    from app.core.database import token_blacklist_col
    try:
        await token_blacklist_col().update_one(
            {"jti": jti},
            {"$set": {
                "jti": jti,
                "expires_at": datetime.fromtimestamp(exp) if exp else datetime.utcnow(),
                "blacklisted_at": datetime.utcnow(),
            }},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"Failed to blacklist token {jti}: {e}")


def verify_token_signature(token: str) -> bool:
    """Verify JWT signature is valid (without type check)."""
    try:
        jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return True
    except JWTError:
        return False
