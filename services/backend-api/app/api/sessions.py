from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Session as SessionModel
from app.schemas.sessions import SessionCreate, SessionOut

router = APIRouter()


@router.get("", response_model=list[SessionOut])
def list_sessions(limit: int = 40, db: Session = Depends(get_db)):
    lim = max(1, min(int(limit), 200))
    return (
        db.query(SessionModel)
        .order_by(SessionModel.started_at.desc())
        .limit(lim)
        .all()
    )


@router.post("", response_model=SessionOut)
def start_session(payload: SessionCreate, db: Session = Depends(get_db)):
    existing = db.query(SessionModel).filter(SessionModel.status == "active").first()
    if existing:
        return existing
    row = SessionModel(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/{session_id}/close", response_model=SessionOut)
def close_session(session_id: int, db: Session = Depends(get_db)):
    row = db.get(SessionModel, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    row.status = "closed"
    row.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
