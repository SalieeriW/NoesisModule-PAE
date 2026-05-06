from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Capture
from app.schemas.captures import CaptureCreate, CaptureOut

router = APIRouter()


@router.post("", response_model=CaptureOut)
def create_capture(payload: CaptureCreate, db: Session = Depends(get_db)):
    row = Capture(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{capture_id}", response_model=CaptureOut)
def get_capture(capture_id: int, db: Session = Depends(get_db)):
    return db.get(Capture, capture_id)
