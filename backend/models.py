"""SQLAlchemy models for user system."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=True)  # Google users may not have password
    nickname = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    auth_provider = Column(String(20), default="local")  # 'local' | 'google'
    google_id = Column(String(255), unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    preferences = relationship("UserPreference", back_populates="user", uselist=False)
    watch_history = relationship("WatchHistory", back_populates="user")

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "nickname": self.nickname,
            "avatar_url": self.avatar_url,
            "auth_provider": self.auth_provider,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
        }


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    favorite_teams = Column(Text, default="[]")  # JSON array
    favorite_players = Column(Text, default="[]")  # JSON array
    preferred_persona = Column(String(50), default="analyst")
    tts_enabled = Column(Boolean, default=True)
    language = Column(String(10), default="zh")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="preferences")

    def to_dict(self):
        import json
        return {
            "id": self.id,
            "user_id": self.user_id,
            "favorite_teams": json.loads(self.favorite_teams) if self.favorite_teams else [],
            "favorite_players": json.loads(self.favorite_players) if self.favorite_players else [],
            "preferred_persona": self.preferred_persona,
            "tts_enabled": self.tts_enabled,
            "language": self.language,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class WatchHistory(Base):
    __tablename__ = "watch_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    game_id = Column(String(100), nullable=True)
    sport = Column(String(20), nullable=True)
    watch_duration = Column(Integer, default=0)  # seconds
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="watch_history")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "game_id": self.game_id,
            "sport": self.sport,
            "watch_duration": self.watch_duration,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
