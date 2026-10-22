from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Meeting, User
from app.schemas import MeetingCreate, MeetingListItem, MeetingOut
from app.summarizer import SummarizerError, summarize

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _get_own_meeting(meeting_id: int, user: User, db: Session) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    # Return 404 (not 403) for other users' meetings so we don't reveal that they exist.
    if meeting is None or meeting.user_id != user.id:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def create_meeting(
    data: MeetingCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = summarize(data.transcript)
    except SummarizerError as e:
        raise HTTPException(status_code=502, detail=str(e))

    meeting = Meeting(
        user_id=user.id,
        title=(data.title or "").strip() or result.title,
        transcript=data.transcript,
        summary=result.model_dump(),
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


@router.get("", response_model=list[MeetingListItem])
def list_meetings(
    q: str | None = Query(default=None, max_length=100, description="Search title and transcript"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Meeting).where(Meeting.user_id == user.id)
    if q:
        pattern = f"%{q}%"
        query = query.where(or_(Meeting.title.ilike(pattern), Meeting.transcript.ilike(pattern)))
    return db.scalars(query.order_by(Meeting.created_at.desc(), Meeting.id.desc())).all()


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_own_meeting(meeting_id, user, db)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(meeting_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_get_own_meeting(meeting_id, user, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
