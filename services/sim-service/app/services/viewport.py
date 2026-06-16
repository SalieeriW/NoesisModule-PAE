from __future__ import annotations

import io
import json
import os
import time
from pathlib import Path

import numpy as np
from PIL import Image

JPEG_QUALITY = 92


def workspace_root() -> Path:
    """Directory that contains ``controllers/`` (Docker: /workspace, local dev: Attemp2 repo root)."""
    env = os.environ.get("NOEMODULE_WORKSPACE", "").strip()
    if env:
        return Path(env).resolve()
    if Path("/workspace/controllers").is_dir():
        return Path("/workspace")
    # .../services/sim-service/app/services/viewport.py → parents[4] = repo root
    here = Path(__file__).resolve()
    return here.parents[4]


def viewport_cache_dir() -> Path:
    return (
        workspace_root()
        / "controllers"
        / "painter_controller"
        / "viewport_cache"
    )


def mask_export_dir() -> Path:
    return viewport_cache_dir() / "mask_exports"


def _rgb_npy() -> Path:
    return viewport_cache_dir() / "rgb.npy"


def _meta_json() -> Path:
    return viewport_cache_dir() / "meta.json"


def _depth_npy() -> Path:
    return viewport_cache_dir() / "depth.npy"


def _detections_json() -> Path:
    return viewport_cache_dir() / "detections.json"


def _operator_json() -> Path:
    return viewport_cache_dir() / "operator_status.json"


def _camera_cmd() -> Path:
    return viewport_cache_dir() / "camera_cmd.json"


def _paint_cmd() -> Path:
    return viewport_cache_dir() / "paint_cmd.json"


def load_latest_viewport_jpeg() -> bytes:
    rgb_path = _rgb_npy()
    if not rgb_path.exists():
        raise FileNotFoundError(
            "No viewport RGB cache. Run Webots with painter_controller + "
            "--viewport-camera-feed so viewport_cache/rgb.npy updates. "
            f"Expected: {rgb_path} (set NOEMODULE_WORKSPACE if controllers live elsewhere)."
        )
    rgb = np.load(rgb_path)
    if rgb.dtype != np.uint8:
        rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    img = Image.fromarray(rgb, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return buf.getvalue()


def write_camera_command(dx: float = 0.0, dy: float = 0.0, zoom: float = 0.0) -> dict:
    d = viewport_cache_dir()
    d.mkdir(parents=True, exist_ok=True)
    state = {"dx": float(dx), "dy": float(dy), "zoom": float(zoom)}
    _camera_cmd().write_text(json.dumps(state), encoding="utf-8")
    return state


def _part_class_from_mask_uri(mask_uri: str) -> str | None:
    stem = Path(mask_uri).stem.lower()
    if stem.endswith("_edited"):
        stem = stem[: -len("_edited")]
    return stem if stem else None


def canonical_mask_uri(mask_uri: str) -> str:
    """Webots resolves only `sim/runtime/masks/<name>.png` against mask_exports."""
    if not mask_uri:
        return mask_uri
    s = mask_uri.strip().split("?")[0]
    key = "sim/runtime/masks/"
    if key in s:
        fname = s.split(key, 1)[1].strip("/").split("/")[-1]
        if fname.endswith(".png"):
            return f"{key}{fname}"
    return mask_uri.strip()


def write_paint_command(paint_job_id: int, mask_uri: str, params: dict) -> dict:
    viewport_cache_dir().mkdir(parents=True, exist_ok=True)
    canon = canonical_mask_uri(mask_uri)
    png_path = mask_export_dir() / Path(canon).name
    if not png_path.is_file():
        import sys

        print(
            f"[sim-service] paint_cmd: mask file not on disk yet: {png_path} "
            f"(uri_in={mask_uri!r} canonical={canon!r})",
            file=sys.stderr,
        )
    requested = params.get("part_class") if isinstance(params, dict) else None
    requested = requested or _part_class_from_mask_uri(canon)
    payload = {
        "paint_job_id": int(paint_job_id),
        "mask_uri": canon,
        "part_class": requested,
        "params": params or {},
        "requested_at": time.time(),
    }
    tmp = viewport_cache_dir() / ".tmp_paint_cmd.json"
    tmp.write_text(json.dumps(payload), encoding="utf-8")
    os.replace(tmp, _paint_cmd())
    return payload


def build_capture_payload() -> dict:
    rgb_path = _rgb_npy()
    if not rgb_path.exists():
        raise FileNotFoundError(
            "viewport rgb missing — Webots viewport feed is not writing cache "
            f"(looked for {rgb_path})"
        )
    meta: dict = {}
    meta_path = _meta_json()
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            meta = {}
    depth_path = _depth_npy()
    depth_uri = f"local://{depth_path.as_posix()}" if depth_path.exists() else ""
    return {
        "frame_uri": "sim/runtime/view/latest.jpg",
        "depth_uri": depth_uri,
        "camera_pose": {},
        "intrinsics": {
            "width": meta.get("width"),
            "height": meta.get("height"),
            "fov_h": meta.get("fov_h"),
        },
        "cache": {
            "rgb_path": str(rgb_path),
            "rgb_mtime": rgb_path.stat().st_mtime,
        },
    }


def read_detections_list() -> list[dict]:
    path = _detections_json()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return list(data.get("detections", []))


def read_operator_status() -> dict:
    op_path = _operator_json()
    if op_path.exists():
        try:
            return json.loads(op_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    rgb_path = _rgb_npy()
    rgb_age = None
    if rgb_path.exists():
        rgb_age = max(0.0, time.time() - rgb_path.stat().st_mtime)
    return {
        "sim_state": "unknown",
        "perception_source": "",
        "rgb_age_seconds": rgb_age,
        "paint": None,
        "detections_file": _detections_json().exists(),
    }


def is_paint_command_pending() -> bool:
    return _paint_cmd().exists()
