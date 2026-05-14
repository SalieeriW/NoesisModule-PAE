from fastapi import APIRouter

from app.api import sessions, captures, detections, masks, paint_jobs, sim, workcells, ws, chat


router = APIRouter()
router.include_router(workcells.router, prefix="/workcells", tags=["workcells"])
router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
router.include_router(captures.router, prefix="/captures", tags=["captures"])
router.include_router(detections.router, prefix="/detections", tags=["detections"])
router.include_router(masks.router, prefix="/masks", tags=["masks"])
router.include_router(paint_jobs.router, prefix="/paint-jobs", tags=["paint-jobs"])
router.include_router(sim.router, prefix="/sim", tags=["sim"])
router.include_router(ws.router, tags=["ws"])
router.include_router(chat.router, prefix="/chat", tags=["chat"])
