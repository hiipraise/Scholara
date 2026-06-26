# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.database import create_indexes, users_col
from app.api import auth, users, courses, feed, admin, questions, intelligence
from app.core.upload_rate_limiter import limiter
from app.core.security_headers import SecurityHeadersMiddleware
from slowapi import _rate_limit_exceeded_handler

app = FastAPI(
    title="Scholara API — Nexus Core",
    description="AI-powered EdTech platform backend (MongoDB)",
    version="2.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.router.redirect_slashes = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth.router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(users.router,     prefix="/api/users",     tags=["Users"])
app.include_router(courses.router,   prefix="/api/courses",   tags=["Courses"])
app.include_router(feed.router,      prefix="/api/feed",      tags=["Feed"])
app.include_router(admin.router,     prefix="/api/admin",     tags=["Admin"])
app.include_router(questions.router, prefix="/api/questions", tags=["Questions"])
app.include_router(intelligence.router, prefix="/api/intelligence", tags=["Intelligence"])


@app.on_event("startup")
async def startup():
    await create_indexes()
    await _ensure_superadmin()


async def _ensure_superadmin():
    col = users_col()
    from datetime import datetime
    if not await col.find_one({"email": settings.SUPERADMIN_EMAIL.lower()}):
        await col.insert_one({
            "email": settings.SUPERADMIN_EMAIL.lower(),
            "full_name": "Praise Chinedu",
            "role": "superadmin",
            "level": "100L",
            "semester": 1,
            "is_active": True,
            "created_at": datetime.utcnow(),
        })


@app.get("/")
async def root():
    return {"message": "Scholara API — Nexus Core v2.0.0", "db": "MongoDB"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
