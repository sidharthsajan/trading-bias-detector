from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.bias_analysis import BiasAnalysis
from app.schemas.common import BiasAnalysisRow, BiasAnalysisCreate
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/bias-analyses", tags=["bias_analyses"])


@router.get("", response_model=list[BiasAnalysisRow])
def list_bias_analyses(
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return db.query(BiasAnalysis).filter(BiasAnalysis.user_id == user_id).order_by(desc(BiasAnalysis.created_at)).all()


@router.delete("")
def delete_all_bias_analyses(
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    db.query(BiasAnalysis).filter(BiasAnalysis.user_id == user_id).delete()
    db.commit()
    return {"ok": True}


@router.post("", response_model=BiasAnalysisRow, status_code=201)
def create_bias_analysis(
    data: BiasAnalysisCreate,
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    row = BiasAnalysis(
        user_id=user_id,
        analysis_type=data.analysis_type,
        severity=data.severity,
        title=data.title,
        description=data.description,
        details=data.details or {},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/bulk", status_code=201)
def create_bias_analyses_bulk(
    data: list[BiasAnalysisCreate],
    user_id: UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    for d in data:
        row = BiasAnalysis(
            user_id=user_id,
            analysis_type=d.analysis_type,
            severity=d.severity,
            title=d.title,
            description=d.description,
            details=d.details or {},
        )
        db.add(row)
    db.commit()
    return {"created": len(data)}
