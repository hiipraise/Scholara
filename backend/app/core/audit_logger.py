# app/core/audit_logger.py
"""
Audit logging for security-sensitive operations.
Tracks authentication, authorization, data access, and administrative actions.
"""
import logging
import json
import os
from datetime import datetime
from typing import Optional, Any, Dict
from fastapi import Depends, Request

from app.core.database import audit_logs_col
from app.core.deps import get_current_user
from app.core.config import settings

# Configure audit logger
audit_logger = logging.getLogger("audit")
if getattr(settings, "ENABLE_AUDIT_LOG", False):
    log_file = getattr(settings, "AUDIT_LOG_FILE", "logs/audit.log")
    try:
        log_dir = os.path.dirname(log_file)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        handler = logging.FileHandler(log_file)
        handler.setFormatter(
            logging.Formatter(
                '%(asctime)s | %(name)s | %(levelname)s | %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
        )
        audit_logger.addHandler(handler)
        audit_logger.setLevel(logging.INFO)
    except OSError:
        # Logging should never prevent the application from starting.
        audit_logger.addHandler(logging.NullHandler())


def log_authentication(email: str, success: bool, reason: str = "", ip: str = ""):
    """Log authentication attempt."""
    if not getattr(settings, "ENABLE_AUDIT_LOG", False):
        return
    
    audit_logger.info(
        json.dumps({
            "event": "authentication",
            "timestamp": datetime.utcnow().isoformat(),
            "email": email,
            "success": success,
            "reason": reason,
            "ip": ip,
        })
    )


def log_authorization(user_id: str, resource: str, action: str, allowed: bool, ip: str = ""):
    """Log authorization check."""
    if not getattr(settings, "ENABLE_AUDIT_LOG", False):
        return
    
    audit_logger.info(
        json.dumps({
            "event": "authorization",
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": user_id,
            "resource": resource,
            "action": action,
            "allowed": allowed,
            "ip": ip,
        })
    )


def log_data_access(user_id: str, resource_type: str, resource_id: str, action: str, ip: str = ""):
    """Log data access events."""
    if not getattr(settings, "ENABLE_AUDIT_LOG", False):
        return
    
    audit_logger.info(
        json.dumps({
            "event": "data_access",
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": user_id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "ip": ip,
        })
    )


def log_admin_action(admin_id: str, action: str, target: str, changes: Dict[str, Any], ip: str = ""):
    """Log administrative actions."""
    if not getattr(settings, "ENABLE_AUDIT_LOG", False):
        return
    
    audit_logger.info(
        json.dumps({
            "event": "admin_action",
            "timestamp": datetime.utcnow().isoformat(),
            "admin_id": admin_id,
            "action": action,
            "target": target,
            "changes": changes,
            "ip": ip,
        })
    )


def log_security_event(event_type: str, details: Dict[str, Any], ip: str = ""):
    """Log security events (rate limit exceeded, failed validation, etc.)."""
    if not getattr(settings, "ENABLE_AUDIT_LOG", False):
        return
    
    audit_logger.warning(
        json.dumps({
            "event": "security_event",
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "details": details,
            "ip": ip,
        })
    )


async def record_audit_log(
    actor_id: str,
    action: str,
    target_id: str,
    payload: Dict[str, Any],
):
    await audit_logs_col().insert_one({
        "actor_id": actor_id,
        "action": action,
        "target_id": target_id,
        "payload": payload,
        "timestamp": datetime.utcnow(),
    })


async def get_audit_recorder(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    async def _recorder(action: str, target_id: str, payload: Dict[str, Any]):
        await record_audit_log(current_user["id"], action, target_id, {
            **payload,
            "path": request.url.path,
            "method": request.method,
        })

    return _recorder
