# app/services/audit_service.py
"""Audit logging — writes structured entries when ENABLE_AUDIT_LOG is True."""
from datetime import datetime
from typing import Optional
import logging

from app.core.config import settings
from app.core.database import audit_logs_col

logger = logging.getLogger(__name__)


async def log_audit(
    actor_id: str,
    actor_email: str,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """Write an audit log entry if ENABLE_AUDIT_LOG is True.

    Parameters
    ----------
    actor_id : str
        The user ID of whoever performed the action.
    actor_email : str
        The email of whoever performed the action.
    action : str
        Dot-delimited action name, e.g. ``"user.create"``, ``"exam.delete"``.
    target_type : str
        The kind of resource acted on, e.g. ``"user"``, ``"exam_slot"``.
    target_id : str, optional
        The unique identifier of the resource (if applicable).
    details : dict, optional
        Any extra context worth recording (old values, new values, etc.).
    """
    if not settings.ENABLE_AUDIT_LOG:
        return
    try:
        await audit_logs_col().insert_one({
            "actor_id": actor_id,
            "actor_email": actor_email,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details or {},
            "timestamp": datetime.utcnow(),
        })
    except Exception as e:
        logger.warning("Failed to write audit log: %s", e)
