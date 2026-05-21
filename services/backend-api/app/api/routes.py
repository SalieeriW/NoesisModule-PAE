from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.api import captures, chat, detections, masks, paint_jobs, sessions, sim, workcells, ws
from app.api.auth import get_current_user
from app.api.auth import router as auth_router
from app.db.session import get_db
from app.models.entities import Detection, MaskRevision
from app.models.entities import PaintJob as PaintJobModel
from app.models.entities import Session as SessionModel

router = APIRouter()

# ── public ────────────────────────────────────────────────────────────────────
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(ws.router, tags=["ws"])  # WS auth via query-param is future work


@router.get("/stats", tags=["public"])
def public_stats(db: DBSession = Depends(get_db)):
    return {
        "sessions": db.query(SessionModel).count(),
        "paint_jobs": db.query(PaintJobModel).count(),
        "mask_revisions": db.query(MaskRevision).count(),
        "detections": db.query(Detection).count(),
    }


# ── protected (JWT required) ───────────────────────────────────────────────────
_protected = APIRouter(dependencies=[Depends(get_current_user)])
_protected.include_router(workcells.router, prefix="/workcells", tags=["workcells"])
_protected.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
_protected.include_router(captures.router, prefix="/captures", tags=["captures"])
_protected.include_router(detections.router, prefix="/detections", tags=["detections"])
_protected.include_router(masks.router, prefix="/masks", tags=["masks"])
_protected.include_router(paint_jobs.router, prefix="/paint-jobs", tags=["paint-jobs"])
_protected.include_router(sim.router, prefix="/sim", tags=["sim"])
_protected.include_router(chat.router, prefix="/chat", tags=["chat"])

router.include_router(_protected)
