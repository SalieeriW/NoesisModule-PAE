from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import Detection, MaskRevision, PaintJob
from app.schemas.paint_jobs import PaintJobCreate, PaintJobOut
from app.services.event_bus import event_bus
from app.services.sim_client import dispatch_paint_job

router = APIRouter()


def _normalize_mask_uri_for_sim(mask_uri: str) -> str:
    """Controller only resolves `sim/runtime/masks/<file>.png` under viewport_cache/mask_exports."""
    if not mask_uri:
        return mask_uri
    s = mask_uri.strip().split("?")[0]
    key = "sim/runtime/masks/"
    if key in s:
        fname = s.split(key, 1)[1].strip("/").split("/")[-1]
        if fname.endswith(".png"):
            return f"{key}{fname}"
    return mask_uri


@router.post("", response_model=PaintJobOut)
def create_paint_job(payload: PaintJobCreate, db: Session = Depends(get_db)):
    row = PaintJob(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/{paint_job_id}/execute", response_model=PaintJobOut)
async def execute_paint_job(paint_job_id: int, db: Session = Depends(get_db)):
    row = db.get(PaintJob, paint_job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Paint job not found")
    revision = db.get(MaskRevision, row.approved_revision_id)
    if not revision:
        raise HTTPException(status_code=404, detail="Approved revision not found")
    det = db.get(Detection, row.detection_id)
    params = dict(row.params or {})
    if det and getattr(det, "part_class", None):
        params.setdefault("part_class", det.part_class)
    mask_uri = _normalize_mask_uri_for_sim(revision.mask_uri)
    row.status = "running"
    db.commit()
    sim_resp = await dispatch_paint_job(row.id, mask_uri, params)
    if not bool(sim_resp.get("consumed_by_controller", True)):
        row.status = "pending_controller"
        db.commit()
    await event_bus.publish(
        {
            "type": "paint_job.started",
            "paint_job_id": row.id,
            "session_id": row.session_id,
            "sim_response": sim_resp,
        }
    )
    db.refresh(row)
    return row


@router.post("/{paint_job_id}/cancel", response_model=PaintJobOut)
async def cancel_paint_job(paint_job_id: int, db: Session = Depends(get_db)):
    row = db.get(PaintJob, paint_job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Paint job not found")
    row.status = "cancelled"
    db.commit()
    await event_bus.publish(
        {
            "type": "paint_job.cancelled",
            "paint_job_id": row.id,
            "session_id": row.session_id,
        }
    )
    db.refresh(row)
    return row


@router.get("/{paint_job_id}", response_model=PaintJobOut)
def get_paint_job(paint_job_id: int, db: Session = Depends(get_db)):
    row = db.get(PaintJob, paint_job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Paint job not found")
    return row
