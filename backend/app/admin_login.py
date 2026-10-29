import hmac

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .admin_credentials import verify_password
from .models import User
from .schemas import AdminLoginInput, AdminLoginResult
from .security import principal


def admin_login_router(settings, database):
    router = APIRouter()

    @router.post("/internal/admin-login", response_model=AdminLoginResult)
    def login(body: AdminLoginInput, viewer: str = Depends(principal),
              db: Session = Depends(database, scope="function")):
        if (not settings.admin_login_account_id or viewer != settings.admin_login_account_id
                or not settings.is_admin(viewer) or settings.college_forum_local):
            raise HTTPException(401, "Invalid credentials")
        # Perform the costly check even when the username is wrong.
        valid_password = verify_password(body.password, settings.admin_login_password_hash.get_secret_value())
        valid_username = hmac.compare_digest(body.username.lower().encode(), settings.admin_login_username.lower().encode())
        if not valid_password or not valid_username:
            raise HTTPException(401, "Invalid credentials")
        account = db.get(User, viewer)
        if account is None:
            if db.scalar(select(User.id).where(User.username_lower == settings.admin_login_username.lower())):
                raise HTTPException(409, "Operator setup unavailable")
            account = User(id=viewer, username=settings.admin_login_username, username_lower=settings.admin_login_username.lower())
            db.add(account)
            db.flush()
        if account.suspended or account.username_lower != settings.admin_login_username.lower():
            raise HTTPException(401, "Invalid credentials")
        # The ID comes from private configuration; no API response exposes it.
        return {"username": account.username}

    return router
