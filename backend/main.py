# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.core.config import settings
from app.core.database import create_indexes, users_col
from app.api import auth, users, courses, feed, admin, questions

app = FastAPI(
    title="Scholara API — Nexus Core",
    description="AI-powered EdTech platform backend (MongoDB)",
    version="2.0.0",
)

app.router.redirect_slashes = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth.router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(users.router,     prefix="/api/users",     tags=["Users"])
app.include_router(courses.router,   prefix="/api/courses",   tags=["Courses"])
app.include_router(feed.router,      prefix="/api/feed",      tags=["Feed"])
app.include_router(admin.router,     prefix="/api/admin",     tags=["Admin"])
app.include_router(questions.router, prefix="/api/questions", tags=["Questions"])


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
