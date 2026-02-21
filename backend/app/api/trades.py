from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from app.database import get_db
from app.models.trade import Trade
from app.schemas.common import TradeRow, TradeCreate
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("", response_model=list[TradeRow])
def list_trades(
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    limit: int = Query(500, le=500),
    order: str = Query("desc", regex="^(asc|desc)$"),
):
    q = db.query(Trade).filter(Trade.user_id == user_id)
    if order == "desc":
        q = q.order_by(desc(Trade.timestamp))
    else:
        q = q.order_by(asc(Trade.timestamp))
    rows = q.limit(limit).all()
    return rows


@router.post("", response_model=TradeRow, status_code=201)
def create_trade(
    data: TradeCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    t = Trade(
        user_id=user_id,
        timestamp=datetime.fromisoformat(data.timestamp.replace("Z", "+00:00")),
        action=data.action,
        asset=data.asset,
        quantity=data.quantity,
        entry_price=data.entry_price,
        exit_price=data.exit_price,
        pnl=data.pnl,
        account_balance=data.account_balance,
        notes=data.notes,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.post("/bulk", status_code=201)
def create_trades_bulk(
    data: list[TradeCreate],
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    for d in data:
        t = Trade(
            user_id=user_id,
            timestamp=datetime.fromisoformat(d.timestamp.replace("Z", "+00:00")),
            action=d.action,
            asset=d.asset,
            quantity=d.quantity,
            entry_price=d.entry_price,
            exit_price=d.exit_price,
            pnl=d.pnl,
            account_balance=d.account_balance,
            notes=d.notes,
        )
        db.add(t)
    db.commit()
    return {"created": len(data)}
