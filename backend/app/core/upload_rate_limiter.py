from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.security import decode_token


def upload_rate_limit_key(request):
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1]
        payload = decode_token(token)
        if payload and payload.get("email"):
            return f"user:{payload['email'].lower()}"
    return get_remote_address(request)


limiter = Limiter(key_func=upload_rate_limit_key, default_limits=[])