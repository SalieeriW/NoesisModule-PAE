import httpx
from fastapi import APIRouter, File, HTTPException, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.sim_client import (
    runtime_camera_control,
    runtime_capture,
    runtime_detect,
    runtime_mask_png,
    runtime_mask_upload_png,
    runtime_start,
    runtime_status,
    runtime_stop,
    runtime_view_latest_jpg,
    runtime_view_stream_chunked,
)

router = APIRouter()


class CameraControlRequest(BaseModel):
    dx: float = 0.0
    dy: float = 0.0
    zoom: float = 0.0


@router.post("/runtime/start")
async def start_runtime():
    return await runtime_start()


@router.post("/runtime/stop")
async def stop_runtime():
    return await runtime_stop()


@router.post("/runtime/capture")
async def capture_runtime():
    try:
        return await runtime_capture()
    except httpx.HTTPStatusError as exc:
        resp = exc.response
        detail = resp.text if resp is not None else str(exc)
        if resp is not None:
            try:
                body = resp.json()
                if isinstance(body, dict) and "detail" in body:
                    detail = body["detail"]
            except ValueError:
                pass
        code = resp.status_code if resp is not None else 502
        raise HTTPException(status_code=code, detail=detail) from exc


@router.post("/runtime/detect")
async def detect_runtime():
    return await runtime_detect()


@router.post("/runtime/camera/control")
async def camera_control(payload: CameraControlRequest):
    return await runtime_camera_control(payload.dx, payload.dy, payload.zoom)


@router.get("/runtime/view/latest.jpg")
async def view_latest_jpg():
    image = await runtime_view_latest_jpg()
    return Response(content=image, media_type="image/jpeg")


@router.get("/runtime/view/stream.mjpg")
async def view_stream_mjpg():
    return StreamingResponse(
        runtime_view_stream_chunked(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, private",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/runtime/status")
async def sim_status_proxy():
    return await runtime_status()


@router.get("/runtime/masks/{filename}")
async def mask_proxy(filename: str):
    try:
        data = await runtime_mask_png(filename)
    except httpx.HTTPStatusError as exc:
        resp = exc.response
        detail = resp.text if resp is not None else str(exc)
        code = resp.status_code if resp is not None else 502
        raise HTTPException(status_code=code, detail=detail) from exc
    return Response(content=data, media_type="image/png")


@router.post("/runtime/masks/upload")
async def mask_upload_proxy(file: UploadFile = File(...)):
    data = await file.read()
    try:
        return await runtime_mask_upload_png(data, file.filename or "edited.png")
    except httpx.HTTPStatusError as exc:
        resp = exc.response
        detail = resp.text if resp is not None else str(exc)
        code = resp.status_code if resp is not None else 502
        raise HTTPException(status_code=code, detail=detail) from exc
