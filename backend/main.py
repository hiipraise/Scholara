# main.py
"""
Scholara Backend — FastAPI Application
Hardened with security middleware, rate limiting, and logging.
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os
import logging
from datetime import datetime

from app.core.config import settings
from app.core.database import create_indexes, users_col
from app.api import auth, users, courses, feed, admin, questions, intelligence
from app.core.rate_limiter import api_rate_limiter
from app.core.password import hash_password
from app.services.job_worker import start_worker, stop_worker

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s | %(name)s | %(levelname)s | %(message)s'
)
logger = logging.getLogger(__name__)

# ════════════════════════════════════════════════════════════════════════════
# CREATE APP
# ════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Scholara API",
    description="AI-powered EdTech platform",
    version="2.1.0",
    docs_url="/api/docs" if settings.APP_ENV == "development" else None,
    redoc_url="/api/redoc" if settings.APP_ENV == "development" else None,
)

app.router.redirect_slashes = False

# ════════════════════════════════════════════════════════════════════════════
# MIDDLEWARE
# ════════════════════════════════════════════════════════════════════════════

# Trusted Host Middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1"] + (
        [origin.replace("http://", "").replace("https://", "").split(":")[0]
         for origin in settings.ALLOWED_ORIGINS]
    ),
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["X-Rate-Limit-Remaining"],
    max_age=3600,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers and rate limiting to all responses."""
    # Rate limiting check
    if settings.ENABLE_REQUEST_LOGGING:
        client_ip = request.client.host if request.client else "unknown"
        allowed, remaining, reset_secs = await api_rate_limiter.is_allowed(
            f"api:{client_ip}",
            max_requests=settings.RATE_LIMIT_REQUESTS_PER_MINUTE,
            window_minutes=1
        )
        if not allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Rate limit exceeded. Try again later."},
                headers={"Retry-After": str(reset_secs)},
            )

    response = await call_next(request)

    # Security headers
    if settings.ENABLE_SECURITY_HEADERS:
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), payment=()"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'none'; "
            "form-action 'none'"
        )

    # HSTS for production
    if settings.ENABLE_HSTS and settings.APP_ENV == "production":
        response.headers["Strict-Transport-Security"] = (
            f"max-age={settings.HSTS_MAX_AGE}; includeSubDomains; preload"
        )

    # Remove server header
    if "Server" in response.headers:
        del response.headers["Server"]

    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests (except health checks) for debugging."""
    if not settings.ENABLE_REQUEST_LOGGING:
        return await call_next(request)

    start_time = datetime.utcnow()
    response = await call_next(request)
    elapsed = (datetime.utcnow() - start_time).total_seconds()

    if request.url.path not in ["/health", "/api/health"]:
        logger.info(
            f"{request.method} {request.url.path} | "
            f"Status: {response.status_code} | "
            f"Duration: {elapsed:.3f}s"
        )

    return response


# ════════════════════════════════════════════════════════════════════════════
# STATIC FILES
# ════════════════════════════════════════════════════════════════════════════

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount(
    "/uploads",
    StaticFiles(directory=settings.UPLOAD_DIR, follow_symlink=False),
    name="uploads",
)

# ════════════════════════════════════════════════════════════════════════════
# API ROUTERS
# ════════════════════════════════════════════════════════════════════════════

app.include_router(auth.router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(users.router,     prefix="/api/users",     tags=["Users"])
app.include_router(courses.router,   prefix="/api/courses",   tags=["Courses"])
app.include_router(feed.router,      prefix="/api/feed",      tags=["Feed"])
app.include_router(admin.router,     prefix="/api/admin",     tags=["Admin"])
app.include_router(questions.router, prefix="/api/questions", tags=["Questions"])
app.include_router(intelligence.router, prefix="/api/intelligence", tags=["Intelligence"])

# ════════════════════════════════════════════════════════════════════════════
# STARTUP / SHUTDOWN
# ════════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup():
    """Initialize database indexes, ensure superadmin, start background worker."""
    logger.info("Starting Scholara API...")

    try:
        await create_indexes()
        logger.info("Database indexes created")
    except Exception as e:
        logger.error(f"Failed to create indexes: {e}")

    try:
        await _ensure_superadmin()
        logger.info("Superadmin verified")
    except Exception as e:
        logger.error(f"Failed to ensure superadmin: {e}")

    # ── Start the MongoDB-backed PDF processing worker ────────────────
    try:
        await start_worker(poll_interval=5.0)
        logger.info("PDF job worker started")
    except Exception as e:
        logger.error(f"Failed to start PDF job worker: {e}")

    logger.info(f"API running in {settings.APP_ENV} mode")


@app.on_event("shutdown")
async def shutdown():
    """Gracefully shut down the background worker."""
    logger.info("Shutting down Scholara API...")
    try:
        await stop_worker()
    except Exception as e:
        logger.error(f"Error stopping worker: {e}")


async def _ensure_superadmin():
    """Ensure superadmin account exists with a password hash."""
    col = users_col()
    email = settings.SUPERADMIN_EMAIL.lower()

    existing = await col.find_one({"email": email})
    if existing:
        return

    # Create superadmin with a strong random password that MUST be changed
    import secrets
    temp_password = secrets.token_urlsafe(15)
    password_hash = hash_password(temp_password)

    await col.insert_one({
        "email": email,
        "full_name": "Superadmin",
        "password_hash": password_hash,
        "role": "superadmin",
        "level": "100L",
        "semester": 1,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_login": None,
    })

    logger.warning(
        f"Superadmin account created for {email}. "
        f"Temporary password: {temp_password} "
        f"(CHANGE THIS IMMEDIATELY via Profile -> Change Password)"
    )


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    return {
        "message": "Scholara API v2.1.0",
        "environment": settings.APP_ENV,
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/health")
async def api_health():
    return {"status": "healthy"}


# ════════════════════════════════════════════════════════════════════════════
# GLOBAL ERROR HANDLER
# ════════════════════════════════════════════════════════════════════════════

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unexpected errors without exposing details in production."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    detail = "Internal server error" if settings.APP_ENV == "production" else str(exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": detail},
    )
