# app/core/audit_logger.py
"""
Audit logging for security-sensitive operations.
Tracks authentication, authorization, data access, and administrative actions.
"""
import logging
import json
from datetime import datetime
from typing import Optional, Any, Dict
from app.core.config import settings

# Configure audit logger
audit_logger = logging.getLogger("audit")
if settings.ENABLE_AUDIT_LOG:
    handler = logging.FileHandler(settings.AUDIT_LOG_FILE)
    handler.setFormatter(
        logging.Formatter(
            '%(asctime)s | %(name)s | %(levelname)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    )
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)


def log_authentication(email: str, success: bool, reason: str = "", ip: str = ""):
    """Log authentication attempt."""
    if not settings.ENABLE_AUDIT_LOG:
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
    if not settings.ENABLE_AUDIT_LOG:
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
    if not settings.ENABLE_AUDIT_LOG:
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
    if not settings.ENABLE_AUDIT_LOG:
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
    if not settings.ENABLE_AUDIT_LOG:
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
