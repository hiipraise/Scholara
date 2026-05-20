# app/core/config.py
"""
Hardened security configuration using environment variables.
All sensitive values loaded from .env file (never hardcoded).
"""
from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path
import os


class Settings(BaseSettings):
    # ── Application ────────────────────────────────────────────────────────
    APP_NAME: str = "Scholara"
    APP_ENV: str = os.getenv("APP_ENV", "development")
    
    # ── Security Keys (MUST be set via environment in production) ──────────
    # Generate: python -c "import secrets; print(secrets.token_urlsafe(32))"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    # Use RS256 (asymmetric) in production for better key rotation
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    
    # ── JWT Configuration ──────────────────────────────────────────────────
    # Short-lived access tokens (15 minutes recommended)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    # Longer-lived refresh tokens (7 days)
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    
    # ── MongoDB (with authentication) ──────────────────────────────────────
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    MONGODB_DB: str = os.getenv("MONGODB_DB", "scholara_db")
    MONGODB_MAX_POOL_SIZE: int = int(os.getenv("MONGODB_MAX_POOL_SIZE", "50"))
    MONGODB_MIN_POOL_SIZE: int = int(os.getenv("MONGODB_MIN_POOL_SIZE", "10"))
    MONGODB_MAX_IDLE_TIME_MS: int = int(os.getenv("MONGODB_MAX_IDLE_TIME_MS", "30000"))
    
    # ── AI Provider (free tiers) ───────────────────────────────────────────
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "groq")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
    
    # ── Email Configuration (SMTP for verification & notifications) ────────
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "noreply@scholara.app")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Scholara")
    EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES", "30")
    )
    
    # ── Superadmin (change this in production!) ────────────────────────────
    SUPERADMIN_EMAIL: str = os.getenv("SUPERADMIN_EMAIL", "admin@scholara.app")
    
    # ── CORS (restrictive by default) ──────────────────────────────────────
    ALLOWED_ORIGINS: List[str] = [
        origin.strip() for origin in 
        os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    ]
    
    # ── File Upload (with validation) ──────────────────────────────────────
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "50"))
    ALLOWED_FILE_EXTENSIONS: List[str] = [
        ext.strip() for ext in
        os.getenv("ALLOWED_FILE_EXTENSIONS", "pdf,docx,pptx,xlsx,csv,txt").split(",")
    ]
    ALLOWED_MIME_TYPES: List[str] = [
        mime.strip() for mime in
        os.getenv("ALLOWED_MIME_TYPES", 
            "application/pdf,"
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document,"
            "application/vnd.openxmlformats-officedocument.presentationml.presentation,"
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,"
            "text/csv,text/plain"
        ).split(",")
    ]
    
    # ── Rate Limiting ──────────────────────────────────────────────────────
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "60"))
    RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE", "5"))
    
    # ── Security Headers ───────────────────────────────────────────────────
    ENABLE_HSTS: bool = os.getenv("ENABLE_HSTS", "true").lower() == "true"
    HSTS_MAX_AGE: int = int(os.getenv("HSTS_MAX_AGE", "31536000"))
    ENABLE_CSP: bool = os.getenv("ENABLE_CSP", "true").lower() == "true"
    ENABLE_SECURITY_HEADERS: bool = os.getenv("ENABLE_SECURITY_HEADERS", "true").lower() == "true"
    
    # ── HTTPS/TLS ──────────────────────────────────────────────────────────
    FORCE_HTTPS: bool = os.getenv("FORCE_HTTPS", "true").lower() == "true" if APP_ENV == "production" else False
    SECURE_COOKIES: bool = os.getenv("SECURE_COOKIES", "true").lower() == "true" if APP_ENV == "production" else False
    HTTPONLY_COOKIES: bool = os.getenv("HTTPONLY_COOKIES", "true").lower() == "true"
    SAMESITE_COOKIES: str = os.getenv("SAMESITE_COOKIES", "Strict")
    
    # ── Logging & Monitoring ───────────────────────────────────────────────
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    ENABLE_AUDIT_LOG: bool = os.getenv("ENABLE_AUDIT_LOG", "true").lower() == "true"
    AUDIT_LOG_FILE: str = os.getenv("AUDIT_LOG_FILE", "logs/audit.log")
    ENABLE_REQUEST_LOGGING: bool = os.getenv("ENABLE_REQUEST_LOGGING", "true").lower() == "true"
    
    class Config:
        env_file = ".env"
        case_sensitive = True
    
    def __init__(self, **data):
        super().__init__(**data)
        # Validate critical settings in production
        if self.APP_ENV == "production":
            if not self.SECRET_KEY or len(self.SECRET_KEY) < 32:
                raise ValueError("SECRET_KEY must be set and at least 32 characters in production")
            if not self.SMTP_PASSWORD:
                raise ValueError("SMTP_PASSWORD must be configured for email verification")
            if not self.ALLOWED_ORIGINS or "localhost" in self.ALLOWED_ORIGINS[0]:
                raise ValueError("ALLOWED_ORIGINS must not include localhost in production")
        
        # Create logs directory if needed
        if self.ENABLE_AUDIT_LOG:
            Path(self.AUDIT_LOG_FILE).parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
