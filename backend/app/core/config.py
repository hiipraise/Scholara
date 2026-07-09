from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "Scholara"
    APP_ENV: str = "development"
    SECRET_KEY: str = "scholara-super-secret-key-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 30

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "scholara_db"

    # ── AI Provider (free tiers) ─────────────────────────────────────────
    # Options: "groq" | "gemini" | "mock"
    # "mock" requires no key and returns placeholder content (good for testing)
    AI_PROVIDER: str = "groq"
    ALLOW_MOCK_QUESTION_GENERATION: bool = False

    # Groq — free at console.groq.com (no billing required)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.1-8b-instant"   # fast & free; alt: llama-3.3-70b-versatile

    # Google Gemini — free at aistudio.google.com/apikey
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"      # free tier, 15 RPM / 1M TPD

    # SuperAdmin
    SUPERADMIN_EMAIL: str = "info.praisechinedu@gmail.com"

    # Audit logging
    ENABLE_AUDIT_LOG: bool = False
    AUDIT_LOG_FILE: str = "logs/audit.log"

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://scholara.app",
    ]

    # Upload
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE_MB: int = 50

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def validate_origins(cls, value: List[str]) -> List[str]:
        if "*" in value:
            raise ValueError("Wildcard CORS origins are not allowed")
        return value

    @model_validator(mode="after")
    def validate_production_secrets(self):
        if self.APP_ENV.lower() == "production" and "change-in-production" in self.SECRET_KEY:
            raise ValueError("SECRET_KEY must be overridden in production")
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()