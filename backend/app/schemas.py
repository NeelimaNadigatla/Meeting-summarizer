from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

MAX_TRANSCRIPT_CHARS = 100_000


# ---------- Auth ----------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Summaries ----------

class ActionItem(BaseModel):
    task: str
    owner: str | None = None
    due: str | None = None


class MeetingSummary(BaseModel):
    title: str
    summary: str
    key_points: list[str]
    decisions: list[str]
    action_items: list[ActionItem]


# ---------- Meetings ----------

class MeetingCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    transcript: str = Field(min_length=20, max_length=MAX_TRANSCRIPT_CHARS)


class MeetingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: datetime


class MeetingOut(MeetingListItem):
    transcript: str
    summary: MeetingSummary
