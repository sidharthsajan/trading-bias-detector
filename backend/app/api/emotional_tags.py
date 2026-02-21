from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.emotional_tag import EmotionalTag
from app.schemas.common import EmotionalTagRow, EmotionalTagCreate
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/emotional-tags", tags=["emotional_tags"])


@router.get("", response_model=list[EmotionalTagRow])
def list_emotional_tags(
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    limit: int = Query(100, le=500),
):
    return (
        db.query(EmotionalTag)
        .filter(EmotionalTag.user_id == user_id)
        .order_by(desc(EmotionalTag.created_at))
        .limit(limit)
        .all()
    )


@router.post("", response_model=EmotionalTagRow, status_code=201)
def create_emotional_tag(
    data: EmotionalTagCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    row = EmotionalTag(
        user_id=user_id,
        trade_id=UUID(data.trade_id) if data.trade_id else None,
        emotional_state=data.emotional_state,
        intensity=data.intensity,
        notes=data.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
