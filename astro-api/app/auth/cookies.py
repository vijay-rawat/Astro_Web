"""The session cookie. HttpOnly (JavaScript can't read it), Secure in production (HTTPS only),
SameSite=Lax (not sent on cross-site POSTs, which blocks CSRF), and Path=/ so EventSource streams
carry it too.

Without "remember me" it is a browser-session cookie (gone when the browser closes, and the server
also expires it after SESSION_TTL_HOURS of inactivity). With it, it lasts SESSION_REMEMBER_DAYS.
"""

from fastapi import Response

from app.config import Settings


def set_session_cookie(response: Response, token: str, remember: bool, settings: Settings) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_remember_days * 86400 if remember else None,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/", httponly=True,
                           secure=settings.secure_cookies, samesite="lax")
