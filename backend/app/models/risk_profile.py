import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func

from app.database import Base


class RiskProfile(Base):
    __tablename__ = "risk_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    overall_score = Column(Numeric(precision=10, scale=4), nullable=False, default=0)
    overtrading_score = Column(Numeric(precision=10, scale=4), nullable=False, default=0)
    loss_aversion_score = Column(Numeric(precision=10, scale=4), nullable=False, default=0)
    revenge_trading_score = Column(Numeric(precision=10, scale=4), nullable=False, default=0)
    discipline_score = Column(Numeric(precision=10, scale=4), nullable=False, default=0)
    emotional_control_score = Column(Numeric(precision=10, scale=4), nullable=False, default=0)
    details = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
