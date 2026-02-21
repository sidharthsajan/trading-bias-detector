from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import asc

from app.database import get_db
from app.models.chat_message import ChatMessage
from app.schemas.common import ChatMessageRow, ChatMessageCreate
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/chat-messages", tags=["chat_messages"])


@router.get("", response_model=list[ChatMessageRow])
def list_chat_messages(
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user_id)
        .order_by(asc(ChatMessage.created_at))
        .all()
    )


@router.post("", response_model=ChatMessageRow, status_code=201)
def create_chat_message(
    data: ChatMessageCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    row = ChatMessage(user_id=user_id, role=data.role, content=data.content)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("")
def delete_all_chat_messages(
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    db.query(ChatMessage).filter(ChatMessage.user_id == user_id).delete()
    db.commit()
    return {"ok": True}
