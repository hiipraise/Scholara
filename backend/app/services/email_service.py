# app/services/email_service.py
"""
Email sending service for verification and notifications.
Uses SMTP with TLS encryption.
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


async def send_verification_email(email: str, verification_token: str) -> bool:
    """
    Send email verification link to user.
    
    Args:
        email: Recipient email address
        verification_token: Verification token to include in link
    
    Returns:
        True if sent successfully, False otherwise
    """
    if not settings.SMTP_PASSWORD:
        logger.warning("SMTP not configured, skipping email send")
        return False
    
    try:
        # Construct verification URL (client-side will handle the token)
        verification_link = f"https://scholara.app/verify-email?email={email}&token={verification_token}"
        
        # Create message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Verify your Scholara email"
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = email
        
        # HTML content
        html = f"""
        <html>
            <body>
                <h2>Verify Your Email</h2>
                <p>Welcome to Scholara! Please verify your email address by clicking the link below:</p>
                <p><a href="{verification_link}">Verify Email</a></p>
                <p>Or copy this link: {verification_link}</p>
                <p>This link expires in {settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES} minutes.</p>
                <hr>
                <p>If you didn't create this account, please ignore this email.</p>
            </body>
        </html>
        """
        
        part = MIMEText(html, "html")
        msg.attach(part)
        
        # Send via SMTP
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()  # TLS encryption
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        
        logger.info(f"Verification email sent to {email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send verification email to {email}: {e}")
        return False


async def send_password_reset_email(email: str, reset_token: str) -> bool:
    """Send password reset link to user."""
    if not settings.SMTP_PASSWORD:
        logger.warning("SMTP not configured, skipping email send")
        return False
    
    try:
        reset_link = f"https://scholara.app/reset-password?email={email}&token={reset_token}"
        
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Reset your Scholara password"
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = email
        
        html = f"""
        <html>
            <body>
                <h2>Reset Your Password</h2>
                <p>Click the link below to reset your password:</p>
                <p><a href="{reset_link}">Reset Password</a></p>
                <p>Or copy this link: {reset_link}</p>
                <p>This link expires in 30 minutes.</p>
                <hr>
                <p>If you didn't request this, please ignore this email.</p>
            </body>
        </html>
        """
        
        part = MIMEText(html, "html")
        msg.attach(part)
        
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        
        logger.info(f"Password reset email sent to {email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send password reset email to {email}: {e}")
        return False
