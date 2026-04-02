# app/core/deps.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.security import decode_token
from app.core.database import users_col

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/signin", auto_error=False)

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Not authenticated",
                        headers={"WWW-Authenticate": "Bearer"})
    if not token:
        raise exc
    payload = decode_token(token)
    if not payload:
        raise exc
    user = await users_col().find_one({"email": payload.get("email")})
    if not user or not user.get("is_active", True):
        raise exc
    user["_id"] = str(user["_id"])
    user["id"] = user["_id"] 
    return user

async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_superadmin_user(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="SuperAdmin access required")
    return current_user
