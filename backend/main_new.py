# main.py
"""
Scholara Backend — FastAPI Application
Enhanced with comprehensive security middleware, rate limiting, and audit logging.
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

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s | %(name)s | %(levelname)s | %(message)s'
)
logger = logging.getLogger(__name__)

# ════════════════════════════════════════════════════════════════════════════════
# CREATE APP
# ════════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Scholara API",
    description="AI-powered EdTech platform with enhanced security",
    version="2.1.0",
    docs_url="/api/docs" if settings.APP_ENV == "development" else None,  # Disable docs in production
    redoc_url="/api/redoc" if settings.APP_ENV == "development" else None,
)

# Disable redirects to prevent certain attacks
app.router.redirect_slashes = False

# ════════════════════════════════════════════════════════════════════════════════
# SECURITY MIDDLEWARE
# ════════════════════════════════════════════════════════════════════════════════

# 1. Trusted Host Middleware — Only allow requests from allowed origins
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "localhost",
        "127.0.0.1",
        "scholara.app",
        "*.scholara.app",
    ]
)

# 2. CORS Middleware — Restrict cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],  # Specific methods only
    allow_headers=["Content-Type", "Authorization"],  # Specific headers only
    expose_headers=["X-Total-Count", "X-Rate-Limit-Remaining"],
    max_age=3600,  # Cache preflight requests for 1 hour
)


# ════════════════════════════════════════════════════════════════════════════════
# CUSTOM MIDDLEWARE
# ════════════════════════════════════════════════════════════════════════════════

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add comprehensive security headers to all responses."""
    
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
                content={"detail": "Rate limit exceeded"},
                headers={"Retry-After": str(reset_secs)}
            )
    
    # Process request
    response = await call_next(request)
    
    # Add security headers
    if settings.ENABLE_SECURITY_HEADERS:
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # Enable XSS protection
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Disable referrer leaking
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Content Security Policy (strict)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        
        # Permissions Policy (limit browser features)
        response.headers["Permissions-Policy"] = (
            "geolocation=(), "
            "microphone=(), "
            "camera=(), "
            "payment=()"
        )
    
    # HSTS (HTTPS only)
    if settings.ENABLE_HSTS and settings.APP_ENV == "production":
        response.headers["Strict-Transport-Security"] = (
            f"max-age={settings.HSTS_MAX_AGE}; includeSubDomains; preload"
        )
    
    # Add rate limit headers
    if hasattr(request.state, "rate_limit_remaining"):
        response.headers["X-Rate-Limit-Remaining"] = str(request.state.rate_limit_remaining)
    
    # Remove server header to avoid leaking server info
    response.headers.pop("Server", None)
    
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests for audit and debugging."""
    if not settings.ENABLE_REQUEST_LOGGING:
        return await call_next(request)
    
    start_time = datetime.utcnow()
    response = await call_next(request)
    elapsed = (datetime.utcnow() - start_time).total_seconds()
    
    # Don't log health checks
    if request.url.path not in ["/health", "/api/health"]:
        logger.info(
            f"{request.method} {request.url.path} | "
            f"Status: {response.status_code} | "
            f"Duration: {elapsed:.3f}s"
        )
    
    return response


# ════════════════════════════════════════════════════════════════════════════════
# STATIC FILES & UPLOADS
# ════════════════════════════════════════════════════════════════════════════════

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount(
    "/uploads",
    StaticFiles(directory=settings.UPLOAD_DIR, follow_symlink=False),
    name="uploads"
)

# ════════════════════════════════════════════════════════════════════════════════
# API ROUTERS
# ════════════════════════════════════════════════════════════════════════════════

app.include_router(auth.router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(users.router,     prefix="/api/users",     tags=["Users"])
app.include_router(courses.router,   prefix="/api/courses",   tags=["Courses"])
app.include_router(feed.router,      prefix="/api/feed",      tags=["Feed"])
app.include_router(admin.router,     prefix="/api/admin",     tags=["Admin"])
app.include_router(questions.router, prefix="/api/questions", tags=["Questions"])
app.include_router(intelligence.router, prefix="/api/intelligence", tags=["Intelligence"])

# ════════════════════════════════════════════════════════════════════════════════
# STARTUP EVENTS
# ════════════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup():
    """Initialize database indexes and create superadmin."""
    logger.info("🚀 Starting Scholara API...")
    
    try:
        await create_indexes()
        logger.info("✓ Database indexes created")
    except Exception as e:
        logger.error(f"✗ Failed to create indexes: {e}")
    
    try:
        await _ensure_superadmin()
        logger.info("✓ Superadmin verified")
    except Exception as e:
        logger.error(f"✗ Failed to ensure superadmin: {e}")
    
    logger.info(f"✓ API running in {settings.APP_ENV} mode")


async def _ensure_superadmin():
    """Ensure superadmin account exists."""
    col = users_col()
    email = settings.SUPERADMIN_EMAIL.lower()
    
    # Check if already exists
    if await col.find_one({"email": email}):
        return
    
    # Create superadmin account (with dummy password - should be set manually)
    from app.core.password import hash_password
    
    await col.insert_one({
        "email": email,
        "full_name": "Administrator",
        "password_hash": hash_password("ChangeMe!123456"),  # CHANGE THIS MANUALLY!
        "role": "superadmin",
        "level": "100L",
        "semester": 1,
        "is_active": True,
        "email_verified": True,
        "created_at": datetime.utcnow(),
        "last_login": None,
    })
    
    logger.warning(f"⚠️  Created superadmin: {email} (CHANGE PASSWORD IMMEDIATELY!)")


# ════════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Scholara API v2.1.0",
        "status": "secure",
        "environment": settings.APP_ENV
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/health")
async def api_health():
    """API health check endpoint."""
    return {"status": "healthy"}


# ════════════════════════════════════════════════════════════════════════════════
# ERROR HANDLERS
# ════════════════════════════════════════════════════════════════════════════════

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unexpected errors without exposing sensitive info."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    # Don't expose detailed error messages in production
    if settings.APP_ENV == "production":
        detail = "Internal server error"
    else:
        detail = str(exc)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": detail}
    )
