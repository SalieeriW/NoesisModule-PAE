from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Detection
from app.schemas.detections import DetectionCreate, DetectionOut

router = APIRouter()


@router.post("", response_model=DetectionOut)
def create_detection(payload: DetectionCreate, db: Session = Depends(get_db)):
    row = Detection(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/capture/{capture_id}", response_model=list[DetectionOut])
def list_capture_detections(capture_id: int, db: Session = Depends(get_db)):
    return db.query(Detection).filter(Detection.capture_id == capture_id).all()
