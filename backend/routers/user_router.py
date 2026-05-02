"""User preferences and watch history router."""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from backend.database import get_db
from backend.models import User, UserPreference, WatchHistory
from backend.auth import get_current_user

router = APIRouter(prefix="/api/user", tags=["user"])


# ─── Pydantic models ─────────────────────────────────────────────────────

class PreferencesUpdate(BaseModel):
    favorite_teams: Optional[List[str]] = None
    favorite_players: Optional[List[str]] = None
    preferred_persona: Optional[str] = None
    tts_enabled: Optional[bool] = None
    language: Optional[str] = None


class WatchHistoryCreate(BaseModel):
    game_id: Optional[str] = None
    sport: Optional[str] = None
    watch_duration: Optional[int] = 0


# ─── Preferences ──────────────────────────────────────────────────────────

@router.get("/preferences")
async def get_preferences(current_user: User = Depends(get_current_user)):
    """Get current user's preferences."""
    if not current_user.preferences:
        return {"preferences": None}
    return {"preferences": current_user.preferences.to_dict()}


@router.put("/preferences")
async def update_preferences(
    request: PreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user's preferences."""

    # Get or create preferences
    prefs = current_user.preferences
    if not prefs:
        prefs = UserPreference(user_id=current_user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    # Update fields
    if request.favorite_teams is not None:
        prefs.favorite_teams = json.dumps(request.favorite_teams)
    if request.favorite_players is not None:
        prefs.favorite_players = json.dumps(request.favorite_players)
    if request.preferred_persona is not None:
        prefs.preferred_persona = request.preferred_persona
    if request.tts_enabled is not None:
        prefs.tts_enabled = request.tts_enabled
    if request.language is not None:
        prefs.language = request.language

    prefs.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(prefs)

    return {"preferences": prefs.to_dict()}


# ─── Watch History ────────────────────────────────────────────────────────

@router.get("/history")
async def get_history(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's watch history."""
    history = (
        db.query(WatchHistory)
        .filter(WatchHistory.user_id == current_user.id)
        .order_by(WatchHistory.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"history": [h.to_dict() for h in history]}


@router.post("/history")
async def add_history(
    request: WatchHistoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a watch history entry."""
    entry = WatchHistory(
        user_id=current_user.id,
        game_id=request.game_id,
        sport=request.sport,
        watch_duration=request.watch_duration,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    return {"entry": entry.to_dict()}
