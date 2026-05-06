from sqlalchemy import func
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Capture, Detection, MaskRevision, Session as JobSession
from app.schemas.masks import MaskRevisionCreate, MaskRevisionOut, MaskRevisionRichOut

router = APIRouter()


@router.get("/revisions/recent", response_model=list[MaskRevisionRichOut])
def list_recent_revisions(limit: int = 40, db: Session = Depends(get_db)):
    lim = max(1, min(limit, 200))
    rows = (
        db.query(MaskRevision, Detection.part_class, Capture.id, JobSession.id, JobSession.vin)
        .join(Detection, MaskRevision.detection_id == Detection.id)
        .join(Capture, Detection.capture_id == Capture.id)
        .join(JobSession, Capture.session_id == JobSession.id)
        .order_by(MaskRevision.created_at.desc())
        .limit(lim)
        .all()
    )
    out: list[MaskRevisionRichOut] = []
    for rev, part_class, cap_id, sess_id, vin in rows:
        out.append(
            MaskRevisionRichOut(
                id=rev.id,
                detection_id=rev.detection_id,
                revision_no=rev.revision_no,
                mask_uri=rev.mask_uri,
                author_id=rev.author_id,
                notes=rev.notes,
                source=rev.source,
                created_at=rev.created_at,
                part_class=part_class,
                capture_id=cap_id,
                session_id=sess_id,
                vin=vin,
            )
        )
    return out


@router.post("/revisions", response_model=MaskRevisionOut)
def upload_revision(payload: MaskRevisionCreate, db: Session = Depends(get_db)):
    max_rev = (
        db.query(func.max(MaskRevision.revision_no))
        .filter(MaskRevision.detection_id == payload.detection_id)
        .scalar()
        or 0
    )
    row = MaskRevision(
        **payload.model_dump(),
        source="operator",
        revision_no=max_rev + 1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/detection/{detection_id}/revisions", response_model=list[MaskRevisionOut])
def list_revisions(detection_id: int, db: Session = Depends(get_db)):
    return (
        db.query(MaskRevision)
        .filter(MaskRevision.detection_id == detection_id)
        .order_by(MaskRevision.revision_no.asc())
        .all()
    )
