import asyncio
import re
import secrets
import time

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, WebSocket
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.services.event_stream import sim_event_stream
from app.services.runtime_adapter import runtime_adapter
from app.services.viewport import (
    load_latest_viewport_jpeg,
    mask_export_dir,
    read_operator_status,
    write_camera_command,
)

router = APIRouter()


class PaintRequest(BaseModel):
    paint_job_id: int
    mask_uri: str
    params: dict = {}


class CameraControlRequest(BaseModel):
    dx: float = 0.0
    dy: float = 0.0
    zoom: float = 0.0


@router.post("/runtime/start")
async def start_runtime():
    evt = await runtime_adapter.start()
    await sim_event_stream.publish(evt)
    return evt


@router.post("/runtime/stop")
async def stop_runtime():
    evt = await runtime_adapter.stop()
    await sim_event_stream.publish(evt)
    return evt


@router.post("/runtime/capture")
async def capture():
    try:
        payload = await runtime_adapter.capture()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    await sim_event_stream.publish({"type": "capture.created", "payload": payload})
    return payload


@router.post("/runtime/detect")
async def detect():
    payload = await runtime_adapter.detect()
    await sim_event_stream.publish({"type": "detection.updated", "payload": payload})
    return payload


@router.post("/runtime/paint")
async def paint(request: PaintRequest):
    payload = await runtime_adapter.execute_paint(
        request.paint_job_id, request.mask_uri, request.params
    )
    for percent in range(0, 101, 10):
        await sim_event_stream.publish(
            {
                "type": "paint.progress",
                "payload": {
                    **payload,
                    "progress_percent": percent,
                },
            }
        )
        await asyncio.sleep(0.06)
    await sim_event_stream.publish({"type": "paint.completed", "payload": payload})
    return payload


@router.get("/runtime/status")
async def runtime_status():
    return read_operator_status()


_MASK_NAME_OK = re.compile(r"^[a-zA-Z0-9_.-]+\.png$")


@router.get("/runtime/masks/{filename}")
async def get_mask_png(filename: str):
    if not _MASK_NAME_OK.match(filename):
        raise HTTPException(status_code=400, detail="invalid mask name")
    path = mask_export_dir() / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="mask not found")
    return FileResponse(path, media_type="image/png")


@router.post("/runtime/masks/upload")
async def upload_mask_png(file: UploadFile = File(...)):
    """Store an operator-edited mask PNG next to YOLO exports (same coordinate frame as viewport)."""
    data = await file.read()
    if len(data) > 6_000_000:
        raise HTTPException(status_code=400, detail="file too large")
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="PNG payload required")
    name = f"edited_{int(time.time())}_{secrets.token_hex(4)}.png"
    out_dir = mask_export_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / name
    path.write_bytes(data)
    uri = f"sim/runtime/masks/{name}"
    await sim_event_stream.publish({"type": "mask.uploaded", "payload": {"mask_uri": uri}})
    return {"filename": name, "mask_uri": uri}


@router.get("/runtime/view/latest.jpg")
async def latest_view():
    try:
        image = load_latest_viewport_jpeg()
        return Response(content=image, media_type="image/jpeg")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/runtime/view/stream.mjpg")
async def stream_view():
    async def frame_stream():
        boundary = b"--frame\r\n"
        while True:
            try:
                image = load_latest_viewport_jpeg()
                yield (
                    boundary
                    + b"Content-Type: image/jpeg\r\n"
                    + f"Content-Length: {len(image)}\r\n\r\n".encode("ascii")
                    + image
                    + b"\r\n"
                )
            except FileNotFoundError:
                # keep stream open while runtime warms up
                pass
            await asyncio.sleep(0.05)

    return StreamingResponse(
        frame_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.post("/runtime/camera/control")
async def control_camera(request: CameraControlRequest):
    payload = write_camera_command(request.dx, request.dy, request.zoom)
    await sim_event_stream.publish({"type": "camera.control", "payload": payload})
    return {"status": "accepted", **payload}


@router.websocket("/ws/events")
async def ws_events(websocket: WebSocket):
    await websocket.accept()
    async for event in sim_event_stream.subscribe():
        await websocket.send_json(event)
