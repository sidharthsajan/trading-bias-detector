from typing import Any
from pydantic import BaseModel
from datetime import datetime


def to_camel(string: str) -> str:
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


class ProfileResponse(BaseModel):
    id: str
    user_id: str
    display_name: str | None
    avatar_url: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TradeRow(BaseModel):
    id: str
    user_id: str
    timestamp: datetime
    action: str
    asset: str
    quantity: float
    entry_price: float
    exit_price: float | None
    pnl: float | None
    account_balance: float | None
    notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class TradeCreate(BaseModel):
    timestamp: str
    action: str
    asset: str
    quantity: float
    entry_price: float
    exit_price: float | None = None
    pnl: float | None = None
    account_balance: float | None = None
    notes: str | None = None


class BiasAnalysisRow(BaseModel):
    id: str
    user_id: str
    analysis_type: str
    severity: str
    title: str
    description: str
    details: dict[str, Any] | None
    created_at: datetime

    class Config:
        from_attributes = True


class BiasAnalysisCreate(BaseModel):
    analysis_type: str
    severity: str
    title: str
    description: str
    details: dict[str, Any] | None = None


class RiskProfileRow(BaseModel):
    id: str
    user_id: str
    overall_score: float
    overtrading_score: float
    loss_aversion_score: float
    revenge_trading_score: float
    discipline_score: float
    emotional_control_score: float
    details: dict[str, Any] | None
    created_at: datetime

    class Config:
        from_attributes = True


class RiskProfileCreate(BaseModel):
    overall_score: float = 0
    overtrading_score: float = 0
    loss_aversion_score: float = 0
    revenge_trading_score: float = 0
    discipline_score: float = 0
    emotional_control_score: float = 0
    details: dict[str, Any] | None = None


class EmotionalTagRow(BaseModel):
    id: str
    user_id: str
    trade_id: str | None
    emotional_state: str
    intensity: float
    notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class EmotionalTagCreate(BaseModel):
    emotional_state: str
    intensity: float = 5
    notes: str | None = None
    trade_id: str | None = None


class ChatMessageRow(BaseModel):
    id: str
    user_id: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChatMessageCreate(BaseModel):
    role: str
    content: str


class AICoachRequest(BaseModel):
    message: str
    trades: list[dict[str, Any]] = []
    biases: list[dict[str, Any]] = []
    history: list[dict[str, Any]] = []


class AICoachResponse(BaseModel):
    reply: str
