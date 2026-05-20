# SCHOLARA SECURITY HARDENING - IMPLEMENTATION GUIDE

**Status:** 🟡 CRITICAL UPGRADES REQUIRED  
**Last Updated:** May 20, 2026  
**Version:** 2.1.0 Secure

---

## 📋 TABLE OF CONTENTS

1. [Quick Start](#quick-start)
2. [Backend Migration](#backend-migration)
3. [Frontend Migration](#frontend-migration)
4. [Database Setup](#database-setup)
5. [Environment Configuration](#environment-configuration)
6. [Testing & Validation](#testing--validation)
7. [Deployment Checklist](#deployment-checklist)

---

## 🚀 QUICK START

### Prerequisites

```bash
# Backend requirements
pip install passlib[bcrypt] cryptography email-validator

# Frontend requirements
npm install axios zustand
```

### Timeline

- **Phase 1 (Week 1):** Backend authentication overhaul
- **Phase 2 (Week 2):** Frontend integration + testing
- **Phase 3 (Week 3):** Database migration + deployment
- **Phase 4 (Week 4):** Monitoring + incident response setup

---

## 🔧 BACKEND MIGRATION

### Step 1: Backup & Update Configuration

```bash
# Backup current config
cp app/core/config.py app/core/config.py.backup
cp main.py main.py.backup

# Create .env file (NEVER commit to git)
cp .env.example .env

# Edit .env with production values
nano .env
```

### .env Configuration Example

```env
APP_ENV=production
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_urlsafe(32))" to generate>
ALGORITHM=RS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/scholara_prod
MONGODB_DB=scholara_db

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=<app-specific-password>
SMTP_FROM_EMAIL=noreply@scholara.app

SUPERADMIN_EMAIL=admin@scholara.app
ALLOWED_ORIGINS=https://scholara.app,https://app.scholara.app

ENABLE_AUDIT_LOG=true
AUDIT_LOG_FILE=logs/audit.log
```

### Step 2: Install New Dependencies

```bash
pip install -r requirements_new.txt
```

**Critical new packages:**

- `passlib[bcrypt]` - Password hashing
- `cryptography==44.0.1` - Strong encryption
- Other updated packages for security patches

### Step 3: Migrate Configuration File

```bash
# Replace old config
cp app/core/config_new.py app/core/config.py

# Verify no hardcoded secrets remain
grep -r "scholara-super-secret" backend/
```

### Step 4: Migrate Security Modules

```bash
# These are NEW files - ensure they're copied:
cp app/core/password_new.py app/core/password.py
cp app/core/security_new.py app/core/security.py
cp app/core/email_verification_new.py app/core/email_verification.py
cp app/core/rate_limiter_new.py app/core/rate_limiter.py
cp app/core/audit_logger_new.py app/core/audit_logger.py
cp app/core/deps_new.py app/core/deps.py
```

### Step 5: Migrate Auth & Main

```bash
# Backup and replace auth endpoint
cp app/api/auth.py app/api/auth.py.backup
cp app/api/auth_new.py app/api/auth.py

# Backup and replace main application
cp main.py main.py.backup
cp main_new.py main.py

# Create email service
cp app/services/email_service.py app/services/email_service.py
```

### Step 6: Database Migration

```bash
# Update user collection schema (add password field)
# Run this script in Python:

async def migrate_users():
    col = users_col()

    # Update all existing users
    result = await col.update_many(
        {},
        {
            "$set": {
                "password_hash": "",  # Will need to be reset
                "email_verified": True,  # Mark existing as verified
                "last_login": None
            }
        }
    )
    print(f"Updated {result.modified_count} users")

# Run:
# python -c "asyncio.run(migrate_users())"
```

### Step 7: Test Backend

```bash
# Create logs directory
mkdir -p logs

# Test with uvicorn
uvicorn main:app --reload --host 127.0.0.1 --port 8000

# In another terminal, test signup:
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@1234567","full_name":"Test User"}'
```

**Expected response:**

```json
{
  "message": "Account created. Check your email to verify.",
  "email": "test@example.com",
  "email_verified": false
}
```

---

## 🎨 FRONTEND MIGRATION

### Step 1: Backup Existing Files

```bash
cp src/api/client.ts src/api/client.ts.backup
cp src/api/auth.ts src/api/auth.ts.backup
cp src/store/authStore.ts src/store/authStore.ts.backup
cp vite.config.ts vite.config.ts.backup
```

### Step 2: Install Secure Files

```bash
cp src/api/client_secure.ts src/api/client.ts
cp src/api/auth_secure.ts src/api/auth.ts
cp src/store/authStore_secure.ts src/store/authStore.ts
cp vite.config_secure.ts vite.config.ts
```

### Step 3: Create Security Middleware

```bash
mkdir -p src/middleware
cp src/middleware/securityHeaders.ts src/middleware/securityHeaders.ts
```

### Step 4: Update App Initialization

Add to `src/main.tsx`:

```typescript
import {
  preventClickjacking,
  setupCSPReporting,
} from "./middleware/securityHeaders";

// Run on app start
preventClickjacking();
setupCSPReporting();
```

### Step 5: Update Login/Signup Pages

**Example sign-up form (`src/pages/AuthPage.tsx`):**

```tsx
import { useAuthStore } from "../store/authStore";

function SignUpForm() {
  const { signUp, isLoading, error } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  async function handleSignUp() {
    try {
      await signUp(email, password, fullName);
      // Show: "Check your email to verify"
    } catch (err) {
      // Show error
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSignUp();
      }}
    >
      <input
        type="text"
        placeholder="Full Name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
      />

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password (min 8 chars, with uppercase, digit, special char)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
      />

      <button type="submit" disabled={isLoading}>
        Sign Up
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </form>
  );
}
```

**Example sign-in form:**

```tsx
async function handleSignIn() {
  try {
    await signIn(email, password);
    // Redirect to dashboard
  } catch (err) {
    // Show error
  }
}
```

### Step 6: Create Email Verification Page

```tsx
// src/pages/VerifyEmailPage.tsx
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useEffect, useState } from "react";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { verifyEmail, isLoading } = useAuthStore();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );

  useEffect(() => {
    const email = searchParams.get("email");
    const token = searchParams.get("token");

    if (!email || !token) {
      setStatus("error");
      return;
    }

    verifyEmail(email, token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div>
      {status === "loading" && <p>Verifying email...</p>}
      {status === "success" && <p>Email verified! You can now login.</p>}
      {status === "error" && (
        <p>Verification failed. Try again or contact support.</p>
      )}
    </div>
  );
}
```

---

## 💾 DATABASE SETUP

### MongoDB with Authentication

```bash
# If using MongoDB Atlas (Recommended):

# 1. Create cluster at mongodb.com/cloud
# 2. Create database user with strong password
# 3. Whitelist IP: 0.0.0.0/0 (or specific IPs)
# 4. Get connection string:

mongodb+srv://user:password@cluster.mongodb.net/scholara_db?retryWrites=true&w=majority
```

### Local MongoDB (Development Only)

```bash
# Install MongoDB Community Edition
# Then add authentication:

mongo
use admin
db.createUser({
  user: "scholara_user",
  pwd: "strong_password_here",
  roles: ["readWrite"]
})

# Connect with auth:
mongosh "mongodb://scholara_user:strong_password_here@localhost:27017/scholara_db"
```

---

## 🔐 ENVIRONMENT CONFIGURATION

### Add to `.gitignore` (CRITICAL)

```
.env
.env.local
.env.*.local
logs/
uploads/
*.log
```

### Generate Secret Key

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
# Output example: X3p5vN2kY9mL7qR8wA1bF4gH6jI0uO_sT5xZ-cM

# Then add to .env:
SECRET_KEY=X3p5vN2kY9mL7qR8wA1bF4gH6jI0uO_sT5xZ-cM
```

### Production Security Checklist

```env
✓ SECRET_KEY set to 32+ random characters
✓ APP_ENV=production
✓ ALGORITHM=RS256 (if using key pairs)
✓ ACCESS_TOKEN_EXPIRE_MINUTES=15 (not 30 days!)
✓ MONGODB_URL uses authentication
✓ ALLOWED_ORIGINS does NOT include localhost
✓ FORCE_HTTPS=true
✓ SECURE_COOKIES=true
✓ HSTS enabled
✓ CSP headers configured
✓ SMTP credentials set for email verification
✓ ENABLE_AUDIT_LOG=true
```

---

## ✅ TESTING & VALIDATION

### Backend Test Suite

```bash
# Install test dependencies
pip install pytest pytest-asyncio

# Run tests
pytest tests/ -v

# Example test (create tests/test_auth.py):
```

```python
import pytest
from app.api.auth import sign_up, sign_in
from app.core.password import validate_password_strength

@pytest.mark.asyncio
async def test_signup_weak_password():
    """Weak password should be rejected"""
    errors = validate_password_strength("weak")
    assert len(errors) > 0

@pytest.mark.asyncio
async def test_signup_strong_password():
    """Strong password should be accepted"""
    errors = validate_password_strength("Test@1234567")
    assert len(errors) == 0

@pytest.mark.asyncio
async def test_rate_limiting():
    """Rate limiting should kick in after max attempts"""
    from app.core.rate_limiter import auth_rate_limiter

    for _ in range(5):
        allowed, _, _ = await auth_rate_limiter.is_allowed(
            "test_user",
            max_requests=5,
            window_minutes=1
        )
        assert allowed

    # 6th request should fail
    allowed, _, _ = await auth_rate_limiter.is_allowed(
        "test_user",
        max_requests=5,
        window_minutes=1
    )
    assert not allowed
```

### Frontend Test Suite

```bash
npm install --save-dev vitest @testing-library/react

# Test token storage
# Create src/__tests__/tokenStorage.test.ts:
```

```typescript
import { setTokens, getAccessToken, clearTokens } from "../api/client";

describe("Token Storage", () => {
  afterEach(() => clearTokens());

  it("should store and retrieve tokens", () => {
    setTokens("access123", "refresh456");
    expect(getAccessToken()).toBe("access123");
  });

  it("should clear tokens", () => {
    setTokens("access123", "refresh456");
    clearTokens();
    expect(getAccessToken()).toBeNull();
  });

  it("should survive page refresh", () => {
    setTokens("access123", "refresh456");
    // Simulate refresh by getting from sessionStorage
    expect(sessionStorage.getItem("scholara_access_token")).toBeTruthy();
  });
});
```

### Security Validation Checklist

```bash
# 1. Verify no hardcoded secrets
grep -r "scholara-super-secret" backend/
grep -r "change-this-to" backend/

# 2. Check password hashing
python -c "from app.core.password import hash_password; print(hash_password('Test@1234567'))"
# Should output bcrypt hash (starts with $2b$)

# 3. Test rate limiting
curl -X POST http://localhost:8000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}' \
  -w "\nStatus: %{http_code}\n"

# 4. Verify security headers
curl -I http://localhost:8000 | grep -i "X-Frame-Options\|X-Content-Type-Options"

# 5. Check CORS restrictions
curl -H "Origin: https://evil.com" -i http://localhost:8000/api/auth/me
# Should NOT have Access-Control-Allow-Origin header
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] All `.backup` files removed from repo
- [ ] `.env` file NOT committed (add to `.gitignore`)
- [ ] All tests passing (backend + frontend)
- [ ] Security headers verified
- [ ] Rate limiting tested
- [ ] Email verification tested end-to-end
- [ ] Audit logging directory created (`mkdir -p logs`)
- [ ] MongoDB authentication verified
- [ ] CORS origins configured for production domain
- [ ] Secret key rotated (new value in `.env`)
- [ ] Superadmin password changed manually
- [ ] HTTPS certificate obtained (Let's Encrypt)

### Production Environment Variables

```bash
# Set in production environment (AWS Secrets Manager, Heroku Config Vars, etc.)
APP_ENV=production
SECRET_KEY=<32+ random characters>
MONGODB_URL=<with authentication>
SMTP_PASSWORD=<app-specific Gmail password>
ALLOWED_ORIGINS=https://scholara.app
# ... all other values from .env
```

### Docker Deployment

```dockerfile
# Update Dockerfile for production:
FROM python:3.11-slim

WORKDIR /app

# Security: Don't run as root
RUN useradd -m -u 1000 scholara
USER scholara

COPY requirements_new.txt .
RUN pip install --no-cache-dir -r requirements_new.txt

COPY --chown=scholara:scholara . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 📊 MONITORING & ALERTS

### Enable Audit Logging

```python
# Logs go to: logs/audit.log
# Example audit events:
{
  "event": "authentication",
  "timestamp": "2026-05-20T10:30:00",
  "email": "user@example.com",
  "success": true
}

{
  "event": "authorization",
  "user_id": "507f1f77bcf86cd799439011",
  "resource": "admin_endpoint",
  "allowed": false
}
```

### Monitor for Security Events

```bash
# Check for rate limit violations
tail -f logs/audit.log | grep "rate_limit_exceeded"

# Check for failed auth attempts
tail -f logs/audit.log | grep "authentication" | grep "false"

# Check for unauthorized access attempts
tail -f logs/audit.log | grep "authorization" | grep "false"
```

---

## 🆘 TROUBLESHOOTING

### "Invalid or expired token"

- [ ] Check `SECRET_KEY` matches between instances
- [ ] Check token not expired (15 min default)
- [ ] Check `ALGORITHM` matches (HS256 vs RS256)

### "Rate limit exceeded"

- [ ] This is normal security behavior
- [ ] Wait the specified time or restart instance
- [ ] Check IP is not blacklisted elsewhere

### "Email verification token invalid"

- [ ] Token expires after 30 minutes
- [ ] User must verify before login
- [ ] Implement "resend verification" endpoint

### "Password too weak"

- [ ] Requires: 8+ chars, uppercase, lowercase, digit, special char
- [ ] Show password strength feedback to users
- [ ] Example strong: `MyPassword!2024`

---

## 📚 REFERENCES

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

**Questions? Issues?** File an issue with logs/screenshots for faster resolution.
