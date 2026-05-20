# app/core/rate_limiter.py
"""
Token bucket rate limiter for authentication and API endpoints.
Prevents brute force attacks and DOS.
"""
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, Tuple
import asyncio


class RateLimiter:
    """
    Thread-safe rate limiter using token bucket algorithm.
    """
    
    def __init__(self):
        self.buckets: Dict[str, Tuple[int, datetime]] = {}
        self.lock = asyncio.Lock()
    
    async def is_allowed(
        self,
        key: str,
        max_requests: int,
        window_minutes: int = 1
    ) -> Tuple[bool, int, int]:  # (allowed, remaining, reset_seconds)
        """
        Check if request is allowed based on rate limit.
        
        Args:
            key: Unique identifier (email, IP, user_id, etc.)
            max_requests: Max requests allowed in window
            window_minutes: Time window in minutes
        
        Returns:
            Tuple of (allowed: bool, remaining_requests: int, reset_seconds: int)
        """
        async with self.lock:
            now = datetime.utcnow()
            
            if key not in self.buckets:
                # New bucket: initialize with max requests
                self.buckets[key] = (max_requests - 1, now)
                reset_time = now + timedelta(minutes=window_minutes)
                return True, max_requests - 1, window_minutes * 60
            
            remaining, last_reset = self.buckets[key]
            elapsed = (now - last_reset).total_seconds()
            window_seconds = window_minutes * 60
            
            # Reset bucket if window expired
            if elapsed >= window_seconds:
                self.buckets[key] = (max_requests - 1, now)
                return True, max_requests - 1, window_minutes * 60
            
            # Check if request allowed
            if remaining > 0:
                self.buckets[key] = (remaining - 1, last_reset)
                reset_seconds = int(window_seconds - elapsed)
                return True, remaining - 1, reset_seconds
            
            # Rate limit exceeded
            reset_seconds = int(window_seconds - elapsed)
            return False, 0, reset_seconds
    
    async def cleanup_old_entries(self, max_age_hours: int = 24):
        """Remove old entries to prevent memory bloat."""
        async with self.lock:
            now = datetime.utcnow()
            cutoff = now - timedelta(hours=max_age_hours)
            
            keys_to_delete = [
                key for key, (_, timestamp) in self.buckets.items()
                if timestamp < cutoff
            ]
            
            for key in keys_to_delete:
                del self.buckets[key]


# Global rate limiters
auth_rate_limiter = RateLimiter()
api_rate_limiter = RateLimiter()
