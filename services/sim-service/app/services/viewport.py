from __future__ import annotations

import time
from pathlib import Path

import httpx

from app.core.config import settings
from app.services.mjpeg_consumer import mjpeg_consumer


def mask_export_dir() -> Path:
    p = Path(settings.mask_export_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def load_latest_viewport_jpeg() -> bytes:
    frame = mjpeg_consumer.latest_frame
    if frame is None:
        raise FileNotFoundError(
            "No frame from Unity yet. Ensure BridgeServer is running on "
            f"{settings.unity_url} and MjpegStreamer is active in the scene."
        )
    return frame


async def write_camera_command(dx: float = 0.0, dy: float = 0.0, zoom: float = 0.0) -> dict:
    payload = {"dx": float(dx), "dy": float(dy), "zoom": float(zoom)}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(f"{settings.unity_url}/api/camera", json=payload)
    except Exception:
        pass
    return payload


async def write_paint_command(paint_job_id: int, mask_uri: str, params: dict) -> dict:
    payload = {
        "paint_job_id": int(paint_job_id),
        "mask_uri": _canonical_mask_uri(mask_uri),
        "part_class": (params or {}).get("part_class"),
        "params": params or {},
        "requested_at": time.time(),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(f"{settings.unity_url}/api/paint", json=payload)
        r.raise_for_status()
    return payload


def build_capture_payload() -> dict:
    meta = mjpeg_consumer.meta
    return {
        "frame_uri": "sim/runtime/view/latest.jpg",
        "depth_uri": "",
        "camera_pose": {},
        "intrinsics": {
            "width": meta.get("width"),
            "height": meta.get("height"),
            "fov_h": meta.get("fov_h"),
        },
        "cache": {"rgb_age_seconds": mjpeg_consumer.frame_age_seconds},
    }


async def read_operator_status() -> dict:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{settings.unity_url}/api/status")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {
        "sim_state": "unknown",
        "perception_source": "viewport",
        "rgb_age_seconds": mjpeg_consumer.frame_age_seconds,
        "paint": None,
    }


def _canonical_mask_uri(mask_uri: str) -> str:
    if not mask_uri:
        return mask_uri
    s = mask_uri.strip().split("?")[0]
    key = "sim/runtime/masks/"
    if key in s:
        fname = s.split(key, 1)[1].strip("/").split("/")[-1]
        if fname.endswith(".png"):
            return f"{key}{fname}"
    return mask_uri.strip()
