# app/core/email_verification.py
"""
Email verification token generation and validation.
Uses secure cryptographic tokens with expiration.
"""
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Tuple
import hmac
from app.core.config import settings


def generate_email_verification_token(email: str, expires_in_minutes: int = None) -> Tuple[str, datetime]:
    """
    Generate a secure email verification token.
    
    Args:
        email: The email address to generate token for
        expires_in_minutes: Token expiration time (default from settings)
    
    Returns:
        Tuple of (token, expiration_datetime)
    """
    if expires_in_minutes is None:
        expires_in_minutes = settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES
    
    # Generate random token
    random_part = secrets.token_urlsafe(32)
    
    # Create HMAC-SHA256 signature
    signature = hmac.new(
        settings.SECRET_KEY.encode(),
        f"{email}:{random_part}".encode(),
        hashlib.sha256
    ).hexdigest()
    
    # Combine: email:random:signature
    token = f"{email}:{random_part}:{signature}"
    
    expiration = datetime.utcnow() + timedelta(minutes=expires_in_minutes)
    
    return token, expiration


def verify_email_token(token: str, email: str, expiration: datetime) -> bool:
    """
    Verify email verification token.
    
    Args:
        token: The token to verify
        email: The expected email
        expiration: The token expiration datetime
    
    Returns:
        True if token is valid and not expired, False otherwise
    """
    # Check expiration
    if datetime.utcnow() > expiration:
        return False
    
    # Parse token
    parts = token.split(":")
    if len(parts) != 3:
        return False
    
    token_email, random_part, provided_sig = parts
    
    # Verify email matches
    if token_email != email:
        return False
    
    # Recompute signature
    expected_sig = hmac.new(
        settings.SECRET_KEY.encode(),
        f"{email}:{random_part}".encode(),
        hashlib.sha256
    ).hexdigest()
    
    # Use constant-time comparison to prevent timing attacks
    return hmac.compare_digest(provided_sig, expected_sig)
