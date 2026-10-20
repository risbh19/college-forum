import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator, model_validator

Board = Literal["general", "cse", "hostel", "placements", "confessions"]
VoteValue = Literal["UP", "DOWN"]
RESERVED = {"admin", "administrator", "moderator", "mod", "support", "deleted", "anonymous", "system", "staff"}


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class UsernameInput(Input):
    username: StrictStr = Field(min_length=3, max_length=20)

    @field_validator("username")
    @classmethod
    def valid_username(cls, value):
        if not re.fullmatch(r"[a-zA-Z0-9_]{3,20}", value):
            raise ValueError("Use 3-20 letters, numbers, or underscores")
        if value.lower() in RESERVED:
            raise ValueError("This username is reserved")
        return value


class PostInput(Input):
    title: StrictStr = Field(min_length=3, max_length=150)
    body: StrictStr = Field(min_length=1, max_length=10000)
    board: Board

    @field_validator("title", "body", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class CommentInput(Input):
    postId: StrictStr = Field(min_length=1, max_length=40)
    body: StrictStr = Field(min_length=1, max_length=2000)

    @field_validator("body", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class VoteInput(Input):
    postId: StrictStr = Field(min_length=1, max_length=40)
    type: VoteValue


class ReportInput(Input):
    postId: StrictStr | None = Field(default=None, min_length=1, max_length=40)
    commentId: StrictStr | None = Field(default=None, min_length=1, max_length=40)
    reason: StrictStr = Field(min_length=3, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def trim_reason(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def one_target(self):
        if (self.postId is None) == (self.commentId is None):
            raise ValueError("Choose one report target")
        return self


class HideInput(Input):
    hidden: Literal[True]


class Success(BaseModel):
    success: bool


class AdminStatus(BaseModel):
    isAdmin: bool


class ModerationItem(BaseModel):
    id: str
    kind: Literal["posts", "comments"]
    title: str | None
    body: str
    hidden: bool
    reportCount: int
    reasons: list[str]


class ModerationQueue(BaseModel):
    items: list[ModerationItem]


class Author(BaseModel):
    username: str


class PostView(BaseModel):
    id: str
    title: str
    body: str
    board: str
    createdAt: str
    author: Author
    commentCount: int
    score: int
    myVote: VoteValue | None
    isMine: bool


class PostsPage(BaseModel):
    posts: list[PostView]
    nextCursor: str | None


class CommentView(BaseModel):
    id: str
    body: str
    createdAt: str
    author: Author
    isMine: bool


class CommentsPage(BaseModel):
    comments: list[CommentView]


class VoteState(BaseModel):
    score: int
    myVote: VoteValue | None
