# Scholara Full-Stack Application Security Analysis Report

**Analysis Date:** May 20, 2026  
**Scope:** FastAPI Backend + React Frontend + MongoDB  
**Risk Level:** 🔴 **CRITICAL** — Multiple critical security flaws require immediate remediation

---

## Executive Summary

The Scholara application has **critical authentication vulnerabilities** that make account takeover trivial, combined with insufficient authorization checks, weak cryptography, and significant data exposure risks. The application is currently **not production-ready** and requires substantial security hardening before deployment.

### Key Findings

- **13 Critical Issues** requiring immediate fixes
- **8 High-priority Issues** affecting data integrity and confidentiality
- **10 Medium-priority Issues** impacting availability and compliance
- **10 Low-priority Issues** for operational excellence

---

## 🔴 CRITICAL PRIORITY ISSUES

### 1. **Email-Only Authentication Without Password**

**File:** [backend/app/api/auth.py](backend/app/api/auth.py#L33)  
**Severity:** CRITICAL  
**Impact:** Complete authentication bypass — anyone can access any user account with just an email

**Problem:**

```python
@router.post("/signin")
async def sign_in(body: SignInRequest):
    """If the email exists → return JWT. If new → create account → return JWT."""
    email = body.email.lower().strip()
    user = await col.find_one({"email": email})
    if not user:
        # ⚠️ Auto-creates account for ANY email
        doc = {"email": email, "full_name": None, ...}
        result = await col.insert_one(doc)
```

**Vulnerability:**

- No password required
- No email verification
- No multi-factor authentication
- Users can instantly create accounts with fake emails
- Accounts with institutional emails can be impersonated

**Remediation:**

```python
# Implement proper authentication:
# 1. Add email verification step
# 2. Require password with complexity rules
# 3. Implement MFA (email OTP or TOTP)
# 4. Add rate limiting on signin
# 5. Add account lockout after failed attempts
```

---

### 2. **Hardcoded Secret Key in Source Code**

**Files:** [backend/app/core/config.py:L5](backend/app/core/config.py#L5), [.env.example](backend/.env.example)  
**Severity:** CRITICAL  
**Impact:** JWT tokens can be forged by anyone with access to repository

**Problem:**

```python
SECRET_KEY: str = "scholara-super-secret-key-change-in-production-2026"
```

**Vulnerability:**

- Secret key exposed in version control history
- Visible in .env.example file
- Any attacker with repo access can forge JWTs
- Previous commits permanently expose the key

**Remediation:**

```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SECRET_KEY: str = Field(default="", min_length=32)  # Must be provided via environment

    class Config:
        env_file = ".env"
        case_sensitive = True

# Requires environment variable: export SECRET_KEY=<256-bit-random-key>
# Generate: python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Immediate Actions:**

- Rotate all JWT keys immediately
- Add `.env` to `.gitignore`
- Remove secret from .env.example
- Audit git history for exposed keys

---

### 3. **30-Day JWT Token Expiration (Excessive)**

**File:** [backend/app/core/config.py:L7](backend/app/core/config.py#L7)  
**Severity:** CRITICAL  
**Impact:** Compromised tokens remain valid for 30 days

**Problem:**

```python
ACCESS_TOKEN_EXPIRE_DAYS: int = 30
```

**Vulnerability:**

- 30 days is far too long for access tokens
- Stolen tokens have 30-day window of exploitation
- No token refresh mechanism visible
- No token revocation/blacklist

**Standard Best Practice:**
| Token Type | Duration | Notes |
|-----------|----------|-------|
| Access Token | 15-30 minutes | Short-lived |
| Refresh Token | 7-30 days | Used to get new access tokens |
| Session | 24 hours | For browser sessions |

**Remediation:**

```python
# Implement JWT with short expiration and refresh tokens
ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # Short-lived access
REFRESH_TOKEN_EXPIRE_DAYS: int = 7     # Longer refresh token

@router.post("/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """Issue new access token using valid refresh token"""
    new_token = create_access_token({"email": current_user["email"]})
    return {"access_token": new_token, "token_type": "bearer"}
```

---

### 4. **Weak JWT Algorithm (HS256 - Symmetric)**

**File:** [backend/app/core/config.py:L6](backend/app/core/config.py#L6)  
**Severity:** CRITICAL  
**Impact:** If secret key is compromised, entire JWT system is compromised

**Problem:**

```python
ALGORITHM: str = "HS256"  # ❌ Symmetric algorithm
```

**Vulnerability:**

- HS256 is symmetric (uses same key for signing and verification)
- All microservices/instances need secret key
- Key compromise means attackers can forge tokens
- Cannot scale to multiple services securely

**Industry Standard:** Use RS256 (asymmetric) or ES256

**Remediation:**

```python
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# Generate RSA keypair (4096-bit):
# python -c "
# from cryptography.hazmat.primitives import serialization
# from cryptography.hazmat.primitives.asymmetric import rsa
# from cryptography.hazmat.backends import default_backend
#
# private_key = rsa.generate_private_key(
#     public_exponent=65537,
#     key_size=4096,
#     backend=default_backend()
# )
#
# private_pem = private_key.private_bytes(
#     encoding=serialization.Encoding.PEM,
#     format=serialization.PrivateFormat.PKCS8,
#     encryption_algorithm=serialization.NoEncryption()
# )
#
# public_pem = private_key.public_key().public_bytes(
#     encoding=serialization.Encoding.PEM,
#     format=serialization.PublicFormat.SubjectPublicKeyInfo
# )
# print(private_pem.decode())
# print(public_pem.decode())
# "

# config.py
ALGORITHM: str = "RS256"
PRIVATE_KEY: str = Field(default="")  # From environment
PUBLIC_KEY: str = Field(default="")   # From environment

# security.py
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(
        to_encode,
        settings.PRIVATE_KEY,
        algorithm="RS256"
    )

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(
            token,
            settings.PUBLIC_KEY,  # Only needs public key
            algorithms=["RS256"]
        )
    except JWTError:
        return None
```

---

### 5. **Hardcoded Superadmin Email in Config and Startup**

**Files:** [backend/app/core/config.py:L26](backend/app/core/config.py#L26), [backend/main.py:L47-L57](backend/main.py#L47)  
**Severity:** CRITICAL  
**Impact:** Hardcoded admin is exposed; role determination is trivial to manipulate

**Problem:**

```python
SUPERADMIN_EMAIL: str = "info.praisechinedu@gmail.com"

@app.on_event("startup")
async def _ensure_superadmin():
    if not await col.find_one({"email": settings.SUPERADMIN_EMAIL.lower()}):
        await col.insert_one({
            "email": settings.SUPERADMIN_EMAIL.lower(),
            "full_name": "Praise Chinedu",
            "role": "superadmin",  # ⚠️ Auto-creates superadmin
            ...
        })
```

**In [auth.py](backend/app/api/auth.py#L22):**

```python
def _role_for(email: str) -> str:
    return "superadmin" if email.lower() == settings.SUPERADMIN_EMAIL.lower() else "student"
```

**Vulnerabilities:**

1. Specific email address is public knowledge (in code, git history, .env.example)
2. Anyone can sign up with this email and get superadmin access
3. Role determination is based on string comparison, not database state
4. No admin role creation audit trail
5. Superadmin account auto-created at startup without verification

**Remediation:**

```python
# config.py
ADMIN_USER_IDS: List[str] = Field(default_factory=list)  # User IDs, not emails
BOOTSTRAP_ADMIN_CONFIGURED: bool = False

# models/__init__.py - Add role management
class UserDoc(BaseModel):
    email: str
    role: str = "student"  # student | instructor | admin | superadmin
    role_granted_by: Optional[str] = None  # User ID who granted role
    role_granted_at: Optional[datetime] = None
    is_role_verified: bool = False  # Must be verified by system

# api/admin.py - Add admin management endpoint
@router.post("/users/{user_id}/assign-role")
async def assign_role(
    user_id: str,
    role: str,
    superadmin: dict = Depends(get_superadmin_user),
):
    """Only superadmins can assign roles; audit logged"""
    if role not in ["student", "instructor", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    await users_col().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "role": role,
            "role_granted_by": superadmin["_id"],
            "role_granted_at": datetime.utcnow(),
            "is_role_verified": False,
        }}
    )
    return {"message": f"Role {role} assigned", "user_id": user_id}

# Seed with explicit admin approval
# Remove auto-creation from startup
```

---

### 6. **Email-Only Account Creation Without Verification**

**File:** [backend/app/api/auth.py:L44-L52](backend/app/api/auth.py#L44)  
**Severity:** CRITICAL  
**Impact:** Account takeover via email spoofing; no account ownership verification

**Problem:**

- No email verification step
- No confirmation link
- No OTP verification
- Anyone can claim any email address

**Remediation:**

```python
from app.core.database import email_verifications_col
from datetime import datetime, timedelta
import secrets

@router.post("/signin")
async def sign_in(body: SignInRequest):
    """Step 1: Send verification email"""
    email = body.email.lower().strip()

    # Generate verification code
    code = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=1)

    await email_verifications_col().update_one(
        {"email": email},
        {"$set": {"code": code, "expires_at": expires_at}},
        upsert=True
    )

    # Send verification email via service
    await send_verification_email(email, code)

    return {"message": "Verification code sent to email"}

@router.post("/verify-email")
async def verify_email(body: EmailVerificationRequest):
    """Step 2: Verify code from email"""
    email = body.email.lower().strip()
    code = body.code

    verification = await email_verifications_col().find_one(
        {"email": email, "code": code}
    )

    if not verification or verification["expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    # Check if user exists
    col = users_col()
    user = await col.find_one({"email": email})

    if not user:
        # Create account after verification
        doc = {
            "email": email,
            "full_name": None,
            "role": "student",
            "level": "100L",
            "semester": 1,
            "is_active": True,
            "is_email_verified": True,
            "created_at": datetime.utcnow(),
        }
        result = await col.insert_one(doc)
        user = await col.find_one({"_id": result.inserted_id})
    elif not user.get("is_email_verified"):
        await col.update_one(
            {"_id": user["_id"]},
            {"$set": {"is_email_verified": True}}
        )

    # Clear verification
    await email_verifications_col().delete_one({"email": email})

    # Return JWT
    token = create_access_token({"email": email, "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "user": _serialize(user)}
```

---

### 7. **Overly Permissive CORS Configuration**

**File:** [backend/main.py:L18-L22](backend/main.py#L18)  
**Severity:** CRITICAL  
**Impact:** CSRF attacks, XSS attacks, unauthorized API access from any origin

**Problem:**

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],              # ❌ All methods allowed
    allow_headers=["*"],              # ❌ All headers allowed
)
```

**Vulnerabilities:**

1. `allow_methods=["*"]` allows DELETE, PATCH, etc. from any origin
2. `allow_headers=["*"]` disables custom header restrictions
3. `allow_credentials=True` with wildcard origins = CSRF vulnerability
4. No `max_age` specified for preflight cache

**Remediation:**

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",      # Dev
        "http://localhost:3000",      # Dev
        "https://scholara.app",       # Production HTTPS only
        "https://www.scholara.app",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Explicit methods
    allow_headers=["Content-Type", "Authorization"],  # Explicit headers
    max_age=3600,  # Cache preflight for 1 hour
)
```

---

### 8. **Missing Input Validation on ObjectIds**

**Files:** Multiple API endpoints including [backend/app/api/courses.py:L114](backend/app/api/courses.py#L114), [backend/app/api/admin.py](backend/app/api/admin.py)  
**Severity:** CRITICAL  
**Impact:** NoSQL injection; arbitrary document deletion/modification

**Problem - Multiple locations:**

In [courses.py:L114-L122](backend/app/api/courses.py#L114-L122):

```python
@router.delete("/{course_id}/pdfs/{pdf_id}")
async def delete_pdf(course_id: str, pdf_id: str, admin: dict = Depends(get_admin_user)):
    result = await pdfs_col().update_one(
        {"_id": ObjectId(pdf_id), "is_deleted": {"$ne": True}},  # ❌ No validation
        {"$set": {"is_deleted": True}},
    )
```

**Vulnerabilities:**

1. `ObjectId()` throws exception on invalid input instead of returning 400
2. No validation that `course_id` matches the PDF's actual course
3. Admin could delete any PDF from any course
4. No authorization check binding PDF to course

**Remediation:**

```python
from bson import ObjectId
from fastapi import HTTPException

def validate_object_id(id_str: str) -> str:
    """Validate and normalize ObjectId string"""
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="Invalid ID format")
    return id_str

@router.delete("/{course_id}/pdfs/{pdf_id}")
async def delete_pdf(
    course_id: str,
    pdf_id: str,
    admin: dict = Depends(get_admin_user),
):
    # Validate IDs
    course_id = validate_object_id(course_id)
    pdf_id = validate_object_id(pdf_id)

    # Verify course exists and is owned by user
    course = await courses_col().find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Verify PDF belongs to course
    pdf = await pdfs_col().find_one({
        "_id": ObjectId(pdf_id),
        "course_id": course_id,  # ✅ Enforce relationship
        "is_deleted": {"$ne": True}
    })
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    # Delete
    await pdfs_col().update_one(
        {"_id": ObjectId(pdf_id)},
        {"$set": {"is_deleted": True}}
    )
    return {"message": "PDF deleted"}
```

---

### 9. **No Rate Limiting on Authentication Endpoints**

**File:** [backend/app/api/auth.py:L33](backend/app/api/auth.py#L33)  
**Severity:** CRITICAL  
**Impact:** Brute force account enumeration; DoS on signin endpoint

**Problem:**

- No rate limiting on `/api/auth/signin`
- No throttling per IP address
- No throttling per email
- Attackers can enumerate valid emails and brute force accounts

**Remediation:**

```bash
# Install rate limiting library
pip install slowapi
```

```python
# app/core/deps.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# app/core/database.py - Add rate limit tracker
async def check_rate_limit(identifier: str, limit: int = 5, window: int = 900) -> bool:
    """Check rate limit for identifier (IP or email)"""
    key = f"rate_limit:{identifier}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, window)
    return count <= limit

# main.py
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda req, exc: JSONResponse(
    status_code=429,
    content={"detail": "Rate limit exceeded"}
))

# app/api/auth.py
from app.core.deps import get_client_ip
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/signin")
@limiter.limit("5/minute")  # 5 attempts per minute per IP
async def sign_in(body: SignInRequest, request: Request):
    email = body.email.lower().strip()

    # Additional email-based rate limit
    email_limit_key = f"auth:{email}"
    if not await check_rate_limit(email_limit_key, limit=10, window=3600):  # 10/hour per email
        raise HTTPException(status_code=429, detail="Too many attempts")

    # ... rest of signin logic
```

---

### 10. **No Email Change Verification**

**File:** [backend/app/api/auth.py:L79-L100](backend/app/api/auth.py#L79)  
**Severity:** CRITICAL  
**Impact:** Account takeover via email change; no verification of new email

**Problem:**

```python
@router.put("/email")
async def change_email(body: ChangeEmailRequest, current_user: dict = Depends(get_current_user)):
    new_email = body.new_email.lower().strip()

    # ❌ No verification of new email
    # ❌ No confirmation link
    # ❌ No old email notification
    await col.update_one(
        {"email": current_user["email"]},
        {"$set": {"email": new_email}}
    )
```

**Vulnerabilities:**

1. Instant email change without verification
2. No notification to old email
3. If JWT is compromised, attacker can change email permanently
4. No 2FA requirement for this sensitive operation

**Remediation:**

```python
@router.put("/email/request-change")
async def request_email_change(
    body: ChangeEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    """Request email change; send verification to NEW email"""
    new_email = body.new_email.lower().strip()

    if await users_col().find_one({"email": new_email}):
        # Don't reveal if email exists
        return {"message": "If email is available, confirmation link sent"}

    code = secrets.token_urlsafe(32)
    await email_change_requests_col().update_one(
        {"user_id": str(current_user["_id"])},
        {"$set": {
            "new_email": new_email,
            "code": code,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(hours=24)
        }},
        upsert=True
    )

    # Send to NEW email
    await send_email_change_verification(new_email, code)

    # Also notify OLD email
    await send_email_change_notification(current_user["email"], new_email)

    return {"message": "Verification link sent to new email"}

@router.post("/email/confirm-change")
async def confirm_email_change(
    body: EmailChangeConfirmRequest,
    current_user: dict = Depends(get_current_user)
):
    """Confirm email change with code from new email"""
    old_email = current_user["email"]
    code = body.code

    request = await email_change_requests_col().find_one({
        "user_id": str(current_user["_id"]),
        "code": code
    })

    if not request or request["expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    new_email = request["new_email"]

    # Update user
    await users_col().update_one(
        {"_id": current_user["_id"]},
        {"$set": {
            "email": new_email,
            "email_changed_at": datetime.utcnow(),
            "email_changed_from": old_email
        }}
    )

    # Clean up
    await email_change_requests_col().delete_one({"_id": request["_id"]})

    return {"message": "Email updated", "new_email": new_email}
```

---

### 11. **MongoDB Database Exposed to Network (No Authentication)**

**File:** [backend/app/core/database.py:L6-L7](backend/app/core/database.py#L6), [backend/app/core/config.py:L11](backend/app/core/config.py#L11)  
**Severity:** CRITICAL  
**Impact:** Complete data breach; unauthorized database access

**Problem:**

```python
MONGODB_URL: str = "mongodb://localhost:27017"
# No username/password, no connection security
```

**Vulnerabilities:**

1. MongoDB listening on all interfaces by default
2. No authentication credentials required
3. No SSL/TLS encryption
4. No network restrictions
5. Data completely exposed to anyone on network

**Remediation:**

```python
# config.py
MONGODB_URL: str = Field(
    default="",
    description="MongoDB connection string with auth"
)
# Should be: mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# Docker/Kubernetes environment:
# MONGODB_URL=mongodb+srv://app_user:${DB_PASSWORD}@scholara-cluster.mongodb.net/scholara_db?authSource=admin&ssl=true

# MongoDB server configuration:
# mongod --auth --bind_ip localhost,<app_server_ip> --ssl --sslPEMKeyFile /etc/ssl/mongodb.pem
```

---

### 12. **Unencrypted Session Storage in SessionStorage**

**File:** [frontend/src/api/client.ts:L33-L49](frontend/src/api/client.ts#L33)  
**Severity:** CRITICAL  
**Impact:** XSS vulnerability exposes JWT tokens; token theft

**Problem:**

```typescript
// Token stored in sessionStorage (vulnerable to XSS)
export function setToken(token: string) {
  _token = token;
  sessionStorage.setItem("scholara_token", token); // ❌ Exposed to XSS
}
```

**Vulnerabilities:**

1. Any XSS vulnerability exposes token
2. sessionStorage accessible via `window.sessionStorage`
3. No HttpOnly flag protection
4. Token persists across browser tabs for the session
5. No token rotation after page load

**Remediation:**

```typescript
// Option 1: HttpOnly cookies (RECOMMENDED)
// Backend sets cookie
// app/core/security.py
from fastapi.responses import JSONResponse

def set_token_cookie(response: JSONResponse, token: str):
    response.set_cookie(
        key="scholara_access_token",
        value=token,
        httponly=True,  # ✅ Not accessible to JavaScript
        secure=True,    # ✅ HTTPS only
        samesite="Strict",  # ✅ CSRF protection
        max_age=900,    # 15 minutes
    )
    return response

# Frontend client.ts
export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {"Content-Type": "application/json"},
  withCredentials: true,  # ✅ Include cookies
});

// Option 2: Memory-only storage (if no HttpOnly possible)
// api/client.ts
let _token: string | null = null;

export function setToken(token: string) {
  _token = token;
  // ✅ Not stored anywhere; lost on page refresh (more secure)
  // ✅ No XSS exposure
}

export function getToken(): string | null {
  return _token;
}

// app/core/deps.py - Add refresh endpoint for page reload
@router.post("/auth/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """Get new token when page reloads; token cleared from memory"""
    token = create_access_token({
        "email": current_user["email"],
        "role": current_user["role"]
    })
    return {"access_token": token, "token_type": "bearer"}

// app.tsx - Call on mount
useEffect(() => {
  authStore.refreshUser();  // This calls /auth/me which needs valid token
  // If no token in memory, will fail and redirect to /auth
}, []);
```

---

### 13. **File Upload Without Proper Validation**

**File:** [backend/app/api/courses.py:L67-L98](backend/app/api/courses.py#L67)  
**Severity:** CRITICAL  
**Impact:** Arbitrary file upload; path traversal; resource exhaustion

**Problem:**

```python
@router.post("/{course_id}/upload-pdf")
async def upload_pdf(
    course_id: str,
    week_number: int = Form(...),
    file: UploadFile = File(...),
    admin: dict = Depends(get_admin_user),
):
    # Only checks extension
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted")

    # ❌ No MIME type check
    # ❌ No file size validation before reading
    # ❌ Potential path traversal
    # ❌ No antivirus scan
    # ❌ No rate limiting

    upload_dir = os.path.join(settings.UPLOAD_DIR, f"course_{course_id}", f"week_{week_number}")
    unique_name = f"{uuid.uuid4().hex}_{file.filename}"  # ❌ Original name preserved
    file_path = os.path.join(upload_dir, unique_name)

    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds limit")
```

**Vulnerabilities:**

1. Extension check only (`.pdf` spoofing)
2. No MIME type verification
3. No file size check before reading (memory exhaustion)
4. Filename not sanitized (path traversal possible with `..` in name)
5. Original filename preserved (information disclosure)
6. No antivirus/malware scan
7. Uploaded files served directly (malware distribution)
8. No rate limiting (resource exhaustion)

**Remediation:**

```python
import magic
import aiofiles
from pathlib import Path

# Install: pip install python-magic-bin

@router.post("/{course_id}/upload-pdf")
@limiter.limit("5/hour")  # 5 files/hour per user
async def upload_pdf(
    course_id: str,
    week_number: int = Form(...),
    file: UploadFile = File(...),
    request: Request,
    admin: dict = Depends(get_admin_user),
):
    # Validate course exists
    course = await courses_col().find_one({"_id": ObjectId(course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Validate filename
    if not file.filename or "/" in file.filename or "\\" in file.filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Check extension
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted")

    # Check MIME type
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type")

    # Check size before reading (prevent memory exhaustion)
    MAX_SIZE = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    content = await file.read()

    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit"
        )

    # Verify PDF magic bytes
    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file")

    # Verify MIME with python-magic
    mime = magic.from_buffer(content, mime=True)
    if mime != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid PDF content")

    # Store with safe name (no original filename)
    upload_dir = Path(settings.UPLOAD_DIR) / f"course_{course_id}" / f"week_{week_number}"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Use only UUID for storage
    safe_filename = f"{uuid.uuid4().hex}.pdf"
    file_path = upload_dir / safe_filename

    # Save file
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # Store metadata (without original filename)
    doc = {
        "course_id": course_id,
        "week_number": week_number,
        "filename": safe_filename,  # Only safe name
        "file_path": str(file_path),
        "original_name": None,  # Don't store original
        "file_size": len(content),
        "content_hash": hashlib.sha256(content).hexdigest(),
        "uploaded_by": admin["id"],
        "uploaded_at": datetime.utcnow(),
        "is_processed": False,
        "is_deleted": False,
    }

    result = await pdfs_col().insert_one(doc)

    # Queue async processing with timeout
    background_tasks.add_task(
        _process_pdf_with_timeout,
        str(result.inserted_id),
        str(file_path),
        course["code"],
        course["title"],
        week_number,
        course_id,
    )

    return {
        "id": str(result.inserted_id),
        "message": "PDF uploaded — processing started",
        "week_number": week_number
    }
```

---

## 🔴 HIGH PRIORITY ISSUES

### 14. **Weak Dependency Versions & Outdated Packages**

**File:** [backend/requirements.txt](backend/requirements.txt)  
**Severity:** HIGH  
**Impact:** Known vulnerabilities in dependencies; RCE possible

**Issues Found:**

```
fastapi==0.111.0           # OK but consider updating
python-jose==3.3.0         # ❌ Old version, has known issues
PyMuPDF==1.24.3            # ❌ Outdated, PDF parsing vulnerabilities
groq==0.9.0                # ❌ Very old, update to latest
google-generativeai==0.7.2 # ❌ Old version with bugs
```

**Remediation:**

```bash
# Update to latest versions
pip install --upgrade \
  fastapi \
  python-jose[cryptography] \
  PyMuPDF \
  groq \
  google-generativeai

# Check for vulnerabilities
pip install safety
safety check

# Or use:
pip install pip-audit
pip-audit
```

```text
requirements.txt (updated):
fastapi>=0.115.0
uvicorn[standard]>=0.31.0
motor>=3.6.0
pymongo>=4.10.0
pydantic>=2.10.0
pydantic-settings>=2.5.0
python-jose[cryptography]>=3.3.0
python-multipart>=0.0.12
aiofiles>=24.1.0
httpx>=0.28.0
PyMuPDF>=1.25.0
groq>=0.11.0
google-generativeai>=0.10.0
python-dotenv>=1.0.1
email-validator>=2.2.0
slowapi>=0.1.9
```

---

### 15. **No Authorization Check on Resource Ownership**

**File:** [backend/app/api/questions.py:L23-L27](backend/app/api/questions.py#L23), [backend/app/api/courses.py:L114-L122](backend/app/api/courses.py#L114)  
**Severity:** HIGH  
**Impact:** Users can view/modify other users' data

**Problem:**

```python
@router.get("/{question_id}")
async def get_question(question_id: str, current_user: dict = Depends(get_current_user)):
    q = await questions_col().find_one({"_id": ObjectId(question_id)})
    # ❌ No check that user should access this course/question
    return q
```

**Vulnerabilities:**

- Users can view questions from courses they're not enrolled in
- Admins can delete any PDF without verifying course ownership
- No tenant isolation

**Remediation:**

```python
@router.get("/{question_id}")
async def get_question(question_id: str, current_user: dict = Depends(get_current_user)):
    try:
        q = await questions_col().find_one({"_id": ObjectId(question_id)})
    except:
        raise HTTPException(status_code=404, detail="Question not found")

    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    # Verify user is in correct level/semester
    course = await courses_col().find_one(
        {"_id": ObjectId(q["course_id"]), "is_active": True}
    )

    if not course:
        raise HTTPException(status_code=404, detail="Question not found")

    # Check authorization
    if not _user_can_access_course(current_user, course):
        raise HTTPException(status_code=403, detail="Not authorized")

    q["id"] = str(q.pop("_id"))
    return q

def _user_can_access_course(user: dict, course: dict) -> bool:
    """Check if user can access course"""
    if user["role"] == "superadmin":
        return True
    if user["role"] == "admin":
        return True  # Admins see all
    if user["level"] == course["level"] and user["semester"] == course["semester"]:
        return True
    return False
```

---

### 16. **No Encryption at Rest**

**Severity:** HIGH  
**Impact:** Data breach; sensitive student information exposed

**Remediation:**

```python
# MongoDB encryption at rest (Enterprise feature)
# OR field-level encryption:

from cryptography.fernet import Fernet
from app.core.config import settings

cipher = Fernet(settings.ENCRYPTION_KEY.encode())

def encrypt_field(value: str) -> str:
    return cipher.encrypt(value.encode()).decode()

def decrypt_field(encrypted: str) -> str:
    return cipher.decrypt(encrypted.encode()).decode()

# Encrypt sensitive fields:
# - Email
# - Full name
# - Personal identifiers
```

---

### 17. **No Audit Logging**

**Severity:** HIGH  
**Impact:** Cannot track who did what; no compliance audit trail

**Remediation:**

```python
# Create audit log collection
async def log_action(
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    changes: dict,
    status: str = "success"
):
    await audit_logs_col().insert_one({
        "user_id": user_id,
        "action": action,  # "create", "update", "delete"
        "resource_type": resource_type,  # "question", "pdf", "user"
        "resource_id": resource_id,
        "changes": changes,
        "status": status,
        "timestamp": datetime.utcnow(),
        "ip_address": get_client_ip(),
        "user_agent": get_user_agent(),
    })

# Usage:
@router.delete("/{course_id}/pdfs/{pdf_id}")
async def delete_pdf(course_id: str, pdf_id: str, admin: dict = Depends(get_admin_user)):
    # ... validation ...

    await pdfs_col().update_one(
        {"_id": ObjectId(pdf_id)},
        {"$set": {"is_deleted": True}}
    )

    # Log action
    await log_action(
        user_id=admin["id"],
        action="delete",
        resource_type="pdf",
        resource_id=pdf_id,
        changes={"is_deleted": True}
    )

    return {"message": "PDF deleted"}
```

---

### 18. **No HTTPS Enforcement**

**Severity:** HIGH  
**Impact:** Man-in-the-middle attacks; credential interception

**Remediation - Dockerfile:**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install security headers middleware
RUN pip install secure

COPY . .
RUN mkdir -p uploads

# Don't run as root
RUN useradd -m -u 1000 scholara && chown -R scholara:scholara /app
USER scholara

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```python
# main.py
from secure import SecureHeaders
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

# Redirect HTTP to HTTPS (only in production)
if settings.APP_ENV == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

# Trust proxy headers for HTTPS detection
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "scholara.app",
        "www.scholara.app",
        "localhost",
    ]
)

# Security headers
secure_headers = SecureHeaders()

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
    return response
```

---

### 19. **No Request Size Limiting (DoS Risk)**

**Severity:** HIGH  
**Impact:** Memory exhaustion; denial of service

**Remediation - main.py:**

```python
from fastapi.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
import io

class RequestSizeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_size: int = 10_000_000):  # 10MB
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_size:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"}
            )
        return await call_next(request)

app.add_middleware(RequestSizeMiddleware, max_size=10_000_000)
```

---

### 20. **Error Messages Revealing System Information**

**Severity:** HIGH  
**Impact:** Information disclosure; helps attackers

**Example:**

```python
# ❌ Bad: reveals which email exists
if await col.find_one({"email": new_email}):
    raise HTTPException(status_code=400, detail="Email already in use")  # Reveals email exists

# ✅ Good: generic message
if await col.find_one({"email": new_email}):
    raise HTTPException(status_code=400, detail="This email cannot be used")  # Doesn't reveal why
```

**Remediation:**

```python
# Use generic error messages in user-facing APIs
# Log detailed errors server-side

import logging

logger = logging.getLogger(__name__)

@router.post("/signin")
async def sign_in(body: SignInRequest):
    try:
        # ... implementation ...
    except Exception as e:
        logger.error(f"Signin error: {e}", extra={"email": body.email})
        raise HTTPException(
            status_code=500,
            detail="Sign-in failed. Please try again later."
        )
```

---

## 🟠 MEDIUM PRIORITY ISSUES

### 21. **No Content Security Policy Headers**

**Severity:** MEDIUM  
**Impact:** XSS attacks; unauthorized script execution

**Remediation:** See High #18 (add CSP header)

---

### 22. **PDF Processing Timeout Not Enforced**

**Severity:** MEDIUM  
**Impact:** Hung processes; resource exhaustion

**Remediation:**

```python
import asyncio

async def _process_pdf_with_timeout(pdf_id: str, file_path: str, ...):
    try:
        await asyncio.wait_for(
            _process_pdf_bg(pdf_id, file_path, ...),
            timeout=300  # 5 minutes
        )
    except asyncio.TimeoutError:
        logger.error(f"PDF processing timeout: {pdf_id}")
        await pdfs_col().update_one(
            {"_id": ObjectId(pdf_id)},
            {"$set": {"processing_error": "Timeout"}}
        )
```

---

### 23. **No CSRF Token Protection on Forms**

**Severity:** MEDIUM  
**Impact:** CSRF attacks on state-changing operations

**Remediation - Frontend:**

```typescript
// React component
import { useEffect, useState } from "react";

function useCSRFToken() {
  const [csrfToken, setCSRFToken] = useState<string>("");

  useEffect(() => {
    // Get CSRF token from server
    fetch("/api/csrf-token")
      .then((r) => r.json())
      .then((data) => setCSRFToken(data.token));
  }, []);

  return csrfToken;
}

// Use in form:
const token = useCSRFToken();

apiClient.interceptors.request.use((config) => {
  if (token) {
    config.headers["X-CSRF-Token"] = token;
  }
  return config;
});
```

**Remediation - Backend:**

```python
from functools import lru_cache
import secrets

csrf_tokens = {}

@router.get("/csrf-token")
async def get_csrf_token(request: Request):
    token = secrets.token_urlsafe(32)
    csrf_tokens[token] = datetime.utcnow() + timedelta(hours=1)
    return {"token": token}

@app.middleware("http")
async def validate_csrf(request: Request, call_next):
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        token = request.headers.get("X-CSRF-Token")
        if not token or token not in csrf_tokens:
            return JSONResponse({"detail": "Invalid CSRF token"}, status_code=403)

        if csrf_tokens[token] < datetime.utcnow():
            del csrf_tokens[token]
            return JSONResponse({"detail": "CSRF token expired"}, status_code=403)

    return await call_next(request)
```

---

### 24. **No Input Sanitization**

**Severity:** MEDIUM  
**Impact:** XSS if user input rendered in HTML; NoSQL injection

**Remediation:**

```python
from bleach import clean
import html

def sanitize_input(value: str, max_length: int = 500) -> str:
    """Sanitize user input"""
    if not isinstance(value, str):
        return ""

    # Truncate
    value = value[:max_length]

    # Remove HTML/JS
    value = clean(value, tags=[], strip=True)

    # Escape
    value = html.escape(value)

    return value.strip()

@router.put("/me")
async def update_profile(body: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    full_name = sanitize_input(body.full_name or "")

    await users_col().update_one(
        {"email": current_user["email"]},
        {"$set": {"full_name": full_name}}
    )
    return {"message": "Profile updated", "full_name": full_name}
```

---

### 25. **Admin Endpoint Without Check on Course Ownership**

**File:** [backend/app/api/admin.py](backend/app/api/admin.py)  
**Severity:** MEDIUM  
**Impact:** Cross-course data manipulation

**Remediation:** See High #15 - add authorization checks

---

### 26. **No Database Backups Configuration**

**Severity:** MEDIUM  
**Impact:** Data loss; no disaster recovery

**Remediation:**

```yaml
# Docker Compose with backup service
version: "3"
services:
  mongodb:
    image: mongo:7
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    volumes:
      - mongodb_data:/data/db
    command: mongod --auth --keyFile /etc/mongo-keyfile

  backup:
    image: mongo:7
    entrypoint: >
      bash -c '
        while true; do
          mongodump --uri "mongodb://admin:${MONGO_PASSWORD}@mongodb:27017" \
            --out /backups/dump_$(date +%Y%m%d_%H%M%S)
          find /backups -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null || true
          sleep 86400
        done
      '
    volumes:
      - mongodb_backups:/backups
    depends_on:
      - mongodb
```

---

### 27. **Session/Token Not Invalidated on Logout**

**Severity:** MEDIUM  
**Impact:** Token reuse after logout; no token blacklist

**Remediation:**

```python
# Create token blacklist
from datetime import datetime, timedelta

async def blacklist_token(token: str, expiry: datetime):
    """Add token to blacklist"""
    await token_blacklist_col().insert_one({
        "token": token,
        "blacklisted_at": datetime.utcnow(),
        "expires_at": expiry,  # Remove from blacklist after expiry
    })

@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user), request: Request):
    # Get token from header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

        # Decode to get expiry
        payload = decode_token(token)
        if payload and "exp" in payload:
            exp_dt = datetime.fromtimestamp(payload["exp"])
            await blacklist_token(token, exp_dt)

    return {"message": "Logged out"}

# Check blacklist on every request
async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    # ... existing code ...

    # Check if token is blacklisted
    if await token_blacklist_col().find_one({"token": token}):
        raise HTTPException(status_code=401, detail="Token revoked")

    # ... rest of function ...
```

---

### 28. **No Frontend HTTPS/TLS**

**Severity:** MEDIUM  
**Impact:** Man-in-the-middle on frontend; credential interception

**Remediation - nginx.conf:**

```nginx
server {
    listen 80;
    server_name scholara.app;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name scholara.app;

    ssl_certificate /etc/ssl/certs/scholara.crt;
    ssl_certificate_key /etc/ssl/private/scholara.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api {
        proxy_pass http://backend:8000;
        proxy_set_header Authorization $http_authorization;
    }
}
```

---

### 29. **No Structured Logging for Security Events**

**Severity:** MEDIUM  
**Impact:** Cannot detect/investigate attacks

**Remediation:**

```python
import logging
import json
from logging.handlers import RotatingFileHandler

# Structured logging
class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
        }
        if hasattr(record, 'user_id'):
            log_obj["user_id"] = record.user_id
        if hasattr(record, 'action'):
            log_obj["action"] = record.action
        return json.dumps(log_obj)

# Setup logging
handler = RotatingFileHandler(
    'logs/security.log',
    maxBytes=100_000_000,  # 100MB
    backupCount=10
)
handler.setFormatter(JSONFormatter())

security_logger = logging.getLogger("security")
security_logger.addHandler(handler)
security_logger.setLevel(logging.INFO)

# Usage:
security_logger.info("User signed in", extra={"user_id": user["id"]})
security_logger.warning("Failed auth attempt", extra={"email": email})
security_logger.error("Unauthorized access attempt", extra={"user_id": user_id, "resource": pdf_id})
```

---

### 30. **Frontend: No SameSite Cookie Attribute**

**Severity:** MEDIUM  
**Impact:** CSRF attacks

**Already covered in High #18** (HttpOnly cookies section)

---

## 🟡 LOW PRIORITY ISSUES

### 31-40. Additional Low-Priority Items

| ID  | Issue                                 | Severity | Impact                   | Remediation                                     |
| --- | ------------------------------------- | -------- | ------------------------ | ----------------------------------------------- |
| 31  | No API rate limiting except auth      | LOW      | Abuse of free AI APIs    | Implement per-user, per-endpoint rate limits    |
| 32  | Missing health/readiness probes       | LOW      | K8s/Orchestration issues | Add `/health`, `/ready` endpoints               |
| 33  | Docker image not hardened             | LOW      | Container escape         | Use `python:3.11-slim-bookworm` + non-root user |
| 34  | No dependency version pinning         | LOW      | Build reproducibility    | Pin all versions: `fastapi==0.115.0`            |
| 35  | No API versioning scheme              | LOW      | Breaking changes         | Add `/api/v1` prefix to endpoints               |
| 36  | Pydantic models lack validation       | LOW      | Data integrity           | Add validators and Field constraints            |
| 37  | No database connection pooling config | LOW      | Connection exhaustion    | Configure pool_size, max_overflow in motor      |
| 38  | Frontend missing CSP nonce            | LOW      | XSS mitigation bypass    | Add nonce to script tags                        |
| 39  | No telemetry/APM                      | LOW      | Cannot monitor           | Add OpenTelemetry or DataDog                    |
| 40  | README lacks security section         | LOW      | Onboarding risk          | Document security best practices                |

---

## 🟢 RECOMMENDATIONS & ACTION PLAN

### Immediate Actions (This Week)

1. **🔴 CRITICAL:** Rotate SECRET_KEY
   - Generate new 256-bit key: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
   - Update in `.env`
   - Re-issue all JWTs by invalidating old ones
   - Remove from git history: `git-filter-repo`

2. **🔴 CRITICAL:** Implement email verification before account creation
   - Add email verification step to /signin
   - Send OTP or confirmation link
   - Reject account creation without verification

3. **🔴 CRITICAL:** Fix CORS configuration
   - Change `allow_methods=["*"]` to explicit methods
   - Change `allow_headers=["*"]` to explicit headers
   - Add `max_age`

4. **🔴 CRITICAL:** Implement rate limiting on auth endpoints
   - Install slowapi
   - Add 5/minute on /signin
   - Add 10/hour per email

5. **🟠 HIGH:** Update JWT algorithm to RS256
   - Generate RSA keypair
   - Update config
   - Update encoding/decoding logic

### Short-term (Next 2 Weeks)

6. **🔴 CRITICAL:** Add email verification to /email change endpoint
7. **🔴 CRITICAL:** Fix file upload validation (MIME type, magic bytes, size limits)
8. **🔴 CRITICAL:** Add MongoDB authentication and SSL/TLS
9. **🟠 HIGH:** Implement token blacklist on logout
10. **🟠 HIGH:** Add audit logging collection

### Medium-term (Month 1)

11. Add input validation/sanitization throughout
12. Implement proper authorization checks on all resources
13. Set up structured logging
14. Add security headers middleware
15. Configure database backups

### Long-term (Before Production)

16. Get security audit from third party
17. Implement bug bounty program
18. Add monitoring/alerting
19. Add end-to-end encryption for sensitive data
20. Complete penetration testing

---

## 📋 COMPLIANCE & STANDARDS

**Frameworks Violated:**

- OWASP Top 10 2023: #1 (Broken Access Control), #2 (Cryptographic Failures), #4 (Insecure Design), #5 (Security Misconfiguration), #7 (XSS), #9 (Logging & Monitoring Failures)
- NIST Cybersecurity Framework: Identify, Protect, Detect functions inadequate
- CWE: #287 (Improper Auth), #200 (Info Exposure), #434 (File Upload), #352 (CSRF), #384 (Session Fixation)

---

## 📊 VULNERABILITY MATRIX

```
┌─────────────────────────────────────────────────────────┐
│ SEVERITY DISTRIBUTION                                   │
├─────────────────────────────────────────────────────────┤
│ 🔴 Critical:  13 issues   [████████████████████░░░░░░░░] │
│ 🟠 High:       8 issues   [████████░░░░░░░░░░░░░░░░░░░░] │
│ 🟡 Medium:    10 issues   [██████████░░░░░░░░░░░░░░░░░░] │
│ 🟢 Low:       10 issues   [██████████░░░░░░░░░░░░░░░░░░] │
└─────────────────────────────────────────────────────────┘

REMEDIATION EFFORT:
  Critical:   40-50 hours
  High:       20-30 hours
  Medium:     15-20 hours
  Low:        10-15 hours
  ─────────────────────────
  Total:      85-115 hours (2-3 weeks for 1 developer)
```

---

## ✅ TESTING CHECKLIST

After implementing fixes, verify with:

- [ ] OWASP ZAP automated scan
- [ ] Burp Suite free tier penetration test
- [ ] Manual authentication flow testing
- [ ] Rate limiting verification
- [ ] CORS policy validation
- [ ] File upload boundary testing
- [ ] Authorization checks on all endpoints
- [ ] Error message review for information disclosure
- [ ] Database connection under SSL/TLS
- [ ] Token expiration and refresh flow

---

## 📚 REFERENCES

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [NIST Authentication Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [CWE Top 25](https://cwe.mitre.org/top25/)

---

**Report Generated:** May 20, 2026  
**Status:** 🔴 NOT PRODUCTION READY  
**Next Review:** After implementing all critical issues
