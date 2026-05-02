"""Authentication router: register, login, Google OAuth, user info."""

import os
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional

from backend.database import get_db
from backend.models import User, UserPreference
from backend.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Google OAuth config
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
APP_URL = os.getenv("APP_URL", "https://vstandby.harrycn.com")


# ─── Pydantic models ─────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    nickname: Optional[str] = None

    def validate_password(self):
        if len(self.password) < 6:
            raise ValueError("Password must be at least 6 characters")
        if len(self.password) > 72:
            self.password = self.password[:72]
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token from frontend


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: int
    email: str
    nickname: Optional[str]
    avatar_url: Optional[str]
    auth_provider: str


# ─── Register ─────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user with email and password."""

    # Validate password length
    if len(request.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters"
        )

    # Truncate password to 72 bytes for bcrypt
    password = request.password[:72]

    # Check if user exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create user
    user = User(
        email=request.email,
        password_hash=get_password_hash(password),
        nickname=request.nickname or request.email.split("@")[0],
        auth_provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create default preferences
    preferences = UserPreference(user_id=user.id)
    db.add(preferences)
    db.commit()

    # Generate token
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user.to_dict()
    }


# ─── Login ────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login with email and password."""

    # Find user
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Verify password
    if not user.password_hash or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    # Generate token
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user.to_dict()
    }


# ─── Google OAuth ─────────────────────────────────────────────────────────

@router.post("/google", response_model=TokenResponse)
async def google_auth(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Authenticate with Google ID token."""

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(
            request.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )

        google_id = idinfo["sub"]
        email = idinfo["email"]
        name = idinfo.get("name", "")
        picture = idinfo.get("picture", "")

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}"
        )

    # Check if user exists by google_id or email
    user = db.query(User).filter(
        (User.google_id == google_id) | (User.email == email)
    ).first()

    if user:
        # Update existing user
        if not user.google_id:
            user.google_id = google_id
            user.auth_provider = "google"
        user.last_login = datetime.utcnow()
        if name and not user.nickname:
            user.nickname = name
        if picture and not user.avatar_url:
            user.avatar_url = picture
        db.commit()
    else:
        # Create new user
        user = User(
            email=email,
            google_id=google_id,
            nickname=name,
            avatar_url=picture,
            auth_provider="google",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create default preferences
        preferences = UserPreference(user_id=user.id)
        db.add(preferences)
        db.commit()

    # Generate token
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user.to_dict()
    }


# ─── Get current user ────────────────────────────────────────────────────

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user info."""
    return {
        "user": current_user.to_dict(),
        "preferences": current_user.preferences.to_dict() if current_user.preferences else None
    }


# ─── Logout (frontend handles token removal) ─────────────────────────────

@router.post("/logout")
async def logout():
    """Logout (frontend should remove token)."""
    return {"message": "Logged out successfully"}


# ─── Update profile ──────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None


@router.put("/profile")
async def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile."""

    if request.nickname is not None:
        current_user.nickname = request.nickname
    if request.avatar_url is not None:
        current_user.avatar_url = request.avatar_url

    db.commit()
    db.refresh(current_user)

    return {"user": current_user.to_dict()}
