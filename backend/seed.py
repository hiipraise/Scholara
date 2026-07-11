"""
Seed script — creates superadmin (from env vars only) and ensures database indexes.
All courses, exams, calendars, and study cycles are managed via the admin panel.
NO hardcoded data here.

Usage:
  python seed.py                          # Normal seed (skips existing admin)
  python seed.py --reset-admin-password   # Force-reset superadmin password
"""
import asyncio
import sys
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.password import hash_password
import secrets


async def seed(*, reset_admin_password: bool = False):
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB]
    now = datetime.utcnow()

    # ── SuperAdmin ──────────────────────────────────────────────────────────
    email = settings.SUPERADMIN_EMAIL.lower()
    existing = await db.users.find_one({"email": email})
    temp_password = secrets.token_urlsafe(15)
    password_hash = hash_password(temp_password)

    if not existing:
        await db.users.insert_one({
            "email": email,
            "full_name": "Superadmin",
            "password_hash": password_hash,
            "role": "superadmin",
            "level": settings.SUPERADMIN_LEVEL,
            "semester": settings.SUPERADMIN_SEMESTER,
            "is_active": True,
            "created_at": now,
            "last_login": None,
        })
        print(f"SuperAdmin created for {email}")
        print(f"Temporary password: {temp_password} (CHANGE IMMEDIATELY)")
    elif reset_admin_password or not existing.get("password_hash"):
        await db.users.update_one(
            {"email": email},
            {"$set": {
                "password_hash": password_hash,
                "must_change_password": True,
            }},
        )
        print(f"SuperAdmin password reset for {email}")
        print(f"New temporary password: {temp_password} (CHANGE IMMEDIATELY)")
    else:
        print(f"SuperAdmin already has a password hash — skipping.")
        print(f"Use --reset-admin-password to force a reset.")

    # ── Database Indexes (idempotent) ───────────────────────────────────────
    await db.users.create_index("email", unique=True)
    await db.courses.create_index("code", unique=True)
    await db.week_progress.create_index(
        [("user_id", 1), ("course_id", 1), ("week_number", 1)], unique=True)
    await db.daily_feeds.create_index(
        [("user_id", 1), ("feed_date", 1)], unique=True)
    await db.study_cycles.create_index(
        [("level", 1), ("semester", 1), ("day_number", 1)], unique=True)
    await db.academic_calendars.create_index(
        [("level", 1), ("semester", 1)], unique=True)
    print("Indexes ensured.")

    client.close()
    print("\nSeed complete.")


if __name__ == "__main__":
    reset = "--reset-admin-password" in sys.argv
    asyncio.run(seed(reset_admin_password=reset))
