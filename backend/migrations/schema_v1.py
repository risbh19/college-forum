"""Frozen baseline schema. Do not replace with current application model imports."""
from datetime import UTC, datetime
from enum import Enum as PythonEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow():
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class VoteType(str, PythonEnum):
    UP = "UP"
    DOWN = "DOWN"


class User(Base):
    __tablename__ = "User"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String)
    username_lower: Mapped[str] = mapped_column("usernameLower", String, unique=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=utcnow)


class Post(Base):
    __tablename__ = "Post"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(String)
    board: Mapped[str] = mapped_column(String)
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=utcnow)
    __table_args__ = (Index("Post_board_createdAt_idx", "board", "createdAt"), Index("Post_createdAt_idx", "createdAt"))


class Comment(Base):
    __tablename__ = "Comment"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    body: Mapped[str] = mapped_column(String)
    post_id: Mapped[str] = mapped_column("postId", ForeignKey("Post.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=utcnow)
    __table_args__ = (Index("Comment_postId_createdAt_idx", "postId", "createdAt"),)


class Vote(Base):
    __tablename__ = "Vote"
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="CASCADE"), primary_key=True)
    post_id: Mapped[str] = mapped_column("postId", ForeignKey("Post.id", ondelete="CASCADE"), primary_key=True)
    type: Mapped[VoteType] = mapped_column(Enum(VoteType, name="VoteType"))
    __table_args__ = (Index("Vote_postId_idx", "postId"),)


class RateBucket(Base):
    __tablename__ = "RateBucket"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window: Mapped[int] = mapped_column(Integer)
    count: Mapped[int] = mapped_column(Integer)


class UsedAssertion(Base):
    __tablename__ = "UsedAssertion"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
