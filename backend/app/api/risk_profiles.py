from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.risk_profile import RiskProfile
from app.schemas.common import RiskProfileRow, RiskProfileCreate
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/risk-profiles", tags=["risk_profiles"])


@router.get("", response_model=list[RiskProfileRow])
def list_risk_profiles(
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    limit: int = Query(10, le=100),
):
    return (
        db.query(RiskProfile)
        .filter(RiskProfile.user_id == user_id)
        .order_by(desc(RiskProfile.created_at))
        .limit(limit)
        .all()
    )


@router.post("", response_model=RiskProfileRow, status_code=201)
def create_risk_profile(
    data: RiskProfileCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    row = RiskProfile(
        user_id=user_id,
        overall_score=data.overall_score,
        overtrading_score=data.overtrading_score,
        loss_aversion_score=data.loss_aversion_score,
        revenge_trading_score=data.revenge_trading_score,
        discipline_score=data.discipline_score,
        emotional_control_score=data.emotional_control_score,
        details=data.details or {},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
