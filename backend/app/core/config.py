# app/core/config.py
"""
Hardened configuration — every secret comes exclusively from environment variables.
NO hardcoded defaults for secrets, credentials, or keys.
If a required env var is missing, the app raises a clear error at startup.
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path
import json


class Settings(BaseSettings):
    # ── Application ────────────────────────────────────────────────────────
    APP_NAME: str = "Scholara"
    APP_ENV: str = "development"

    # ── Security Keys (REQUIRED via environment — NO defaults) ─────────────
    SECRET_KEY: str = ""                    # REQUIRED — must be set via .env
    ALGORITHM: str = "HS256"

    # ── JWT Configuration ──────────────────────────────────────────────────
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Signup Gating ──────────────────────────────────────────────────────
    SIGNUP_INVITE_CODE: str = ""            # REQUIRED — users must supply this to sign up

    # ── MongoDB ────────────────────────────────────────────────────────────
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "scholara_db"

    # ── AI Provider (free tiers) ───────────────────────────────────────────
    AI_PROVIDER: str = "groq"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.1-70b-versatile"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"
    ALLOW_MOCK_QUESTION_GENERATION: bool = False  # only effective when AI_PROVIDER=mock and APP_ENV != production

    # ── SuperAdmin ────────────────────────────────────────────────────────
    SUPERADMIN_EMAIL: str = ""              # REQUIRED — must be set via .env
    SUPERADMIN_LEVEL: str = "100L"          # Optional, default "100L"
    SUPERADMIN_SEMESTER: int = 1            # Optional, default 1

    # ── CORS / Host validation ─────────────────────────────────────────────
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]
    TRUSTED_HOSTS: List[str] = []

    @field_validator("ALLOWED_ORIGINS", "TRUSTED_HOSTS", mode="before")
    @classmethod
    def parse_csv_or_json_list(cls, value):
        """Accept either JSON arrays or comma-separated env-var lists."""
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return json.loads(stripped)
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    # ── File Upload ────────────────────────────────────────────────────────
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE_MB: int = 50

    # ── Rate Limiting ──────────────────────────────────────────────────────
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 60
    RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE: int = 5

    # ── Security Headers ───────────────────────────────────────────────────
    ENABLE_HSTS: bool = True
    HSTS_MAX_AGE: int = 31536000
    ENABLE_SECURITY_HEADERS: bool = True
    ENABLE_REQUEST_LOGGING: bool = True

    # ── HTTPS/TLS ──────────────────────────────────────────────────────────
    FORCE_HTTPS: bool = False
    SECURE_COOKIES: bool = False

    # ── Logging ────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    ENABLE_AUDIT_LOG: bool = False
    AUDIT_LOG_FILE: str = "logs/audit.log"

    class Config:
        env_file = ".env"
        case_sensitive = True

    def __init__(self, **data):
        super().__init__(**data)

        # ── REQUIRED env-var validation — fail fast with clear messages ──
        missing: list[str] = []

        if not self.SECRET_KEY:
            missing.append("SECRET_KEY")
        if not self.SUPERADMIN_EMAIL:
            missing.append("SUPERADMIN_EMAIL")
        if not self.SIGNUP_INVITE_CODE:
            missing.append("SIGNUP_INVITE_CODE")

        if self.APP_ENV == "production":
            if not self.MONGODB_URL or self.MONGODB_URL == "mongodb://localhost:27017":
                missing.append("MONGODB_URL (must be set for production)")
            if self.AI_PROVIDER.lower() == "mock" or self.ALLOW_MOCK_QUESTION_GENERATION:
                missing.append(
                    "AI_PROVIDER/ALLOW_MOCK_QUESTION_GENERATION (mock mode is not allowed in production)"
                )

        if missing:
            raise ValueError(
                "CRITICAL CONFIGURATION ERROR — The following required environment "
                "variables are missing or empty:\n  " + "\n  ".join(missing) + "\n\n"
                "Set them in your .env file or environment before starting the server."
            )

        # Create logs directory if audit logging enabled
        if self.ENABLE_AUDIT_LOG:
            Path(self.AUDIT_LOG_FILE).parent.mkdir(parents=True, exist_ok=True)


settings = Settings()