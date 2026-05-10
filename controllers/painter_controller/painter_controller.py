"""Webots painter POC — viewport RGB-D + YOLO segment → Open3D normals → paint dots.

Requires Supervisor TRUE. Uses DEF VIEWPORT_RGB cache when ``--viewport-camera-feed``
runs; else wrist DEF EE_CAMERA + range_finder. Paint marks spawn in world coords via
``deposit_paint_mark`` (robot base → world using DEF UR5E_BASE).

See viewport_feed.py for the sibling Robot that fills viewport_cache/.
"""

from __future__ import annotations

import sys

if __name__ == "__main__" and "--viewport-camera-feed" in sys.argv:
    from viewport_feed import run_viewport_feed

    run_viewport_feed()
    raise SystemExit(0)

import ctypes
import json
import math
import os
import pathlib
import re
import time
from typing import List, Optional, Tuple


def _atomic_replace(src, dst) -> None:
    """os.replace() fails on Windows if dst is held open by another process."""
    import shutil
    try:
        os.replace(src, dst)
    except PermissionError:
        try:
            shutil.copy2(src, dst)
            pathlib.Path(src).unlink(missing_ok=True)
        except OSError:
            pass  # file locked by Docker; drop this write, next tick will retry

import numpy as np

import cv2
import open3d as o3d
import torch
from ultralytics import YOLO


def _best_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"

TORCH_DEVICE = _best_device()

from controller import Keyboard, Supervisor

try:
    sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
    sys.stderr.reconfigure(line_buffering=True)  # type: ignore[attr-defined]
except AttributeError:
    import io as _io

    sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, line_buffering=True)
    sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, line_buffering=True)


# --- Tunables -----------------------------------------------------------------

MODEL_PATH_PRIMARY = pathlib.Path(__file__).with_name("best.pt")
MODEL_PATH_FALLBACK = "yolov8n-seg.pt"

TARGET_CLASSES = {
    "front_door",
    "back_door",
    "front_left_door",
    "front_right_door",
    "back_left_door",
    "back_right_door",
    "hood",
    "tailgate",
    "trunk",
    "front_bumper",
    "back_bumper",
}

YOLO_CONFIDENCE = 0.10
PAINT_CONFIDENCE_MIN = 0.30
DETECTION_DEBUG_TOPK = 5
DEBUG_USE_COCO_FALLBACK = False

STANDOFF_M = 0.25
PAINT_TICKS_PER_WAYPOINT = 1
MIN_WAYPOINTS = 1

DEBUG_FRAME_DIR = pathlib.Path(__file__).with_name("debug")
DEBUG_FRAME_LATEST = DEBUG_FRAME_DIR / "latest_camera.png"
DEBUG_DEPTH_LATEST = DEBUG_FRAME_DIR / "latest_depth.png"
DEBUG_SAVE_FRAMES = True

CAMERA_NAME = "camera"
DEPTH_NAME = "range_finder"

BASE_DEF = "UR5E_BASE"
CAMERA_DEF = "EE_CAMERA"
VIEWPORT_RGB_DEF = "VIEWPORT_RGB"
VIEWPORT_DEPTH_DEF = "VIEWPORT_DEPTH"
VIEWPORT_RIG_DEF = "VIEWPORT_RIG"
VIEWPOINT_DEF = "MAIN_VIEWPOINT"

# Match viewport_feed.CACHE_DIR: resolved package dir + viewport_cache (same folder Webots + Docker use).
VIEWPORT_CACHE_DIR = pathlib.Path(__file__).resolve().parent / "viewport_cache"
VIEWPORT_CAMERA_CMD_PATH = VIEWPORT_CACHE_DIR / "camera_cmd.json"
VIEWPORT_PAINT_CMD_PATH = VIEWPORT_CACHE_DIR / "paint_cmd.json"
# Viewport feed must refresh at least this often; keep generous so slow feeds still match
# geometry (stale cache falls back to wrist camera — see capture_perception).
VIEWPORT_FRAME_MAX_AGE_S = 2.0


def _export_slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", name).strip("_")
    return s or "part"


def _bbox_from_mask(mask_bool: np.ndarray) -> dict:
    ys, xs = np.where(mask_bool)
    if ys.size == 0:
        return {"x": 0, "y": 0, "w": 0, "h": 0}
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    return {"x": x0, "y": y0, "w": x1 - x0 + 1, "h": y1 - y0 + 1}


def export_operator_detections(cache_dir: pathlib.Path, usable: List[dict], source: str) -> None:
    """Write detections + mask PNGs for sim-service / frontend (from live YOLO)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    mask_dir = cache_dir / "mask_exports"
    mask_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for c in usable:
        cls_name = c["cls_name"]
        slug = _export_slug(cls_name)
        mb = c["mask_bool"]
        png_path = mask_dir / f"{slug}.png"
        cv2.imwrite(str(png_path), (mb.astype(np.uint8) * 255))
        rows.append(
            {
                "part_class": cls_name,
                "confidence": float(c["conf"]),
                "bbox": _bbox_from_mask(mb),
                "raw_mask_uri": f"sim/runtime/masks/{slug}.png",
            }
        )
    payload = {
        "updated_at": time.time(),
        "source": source,
        "detections": rows,
    }
    tmp = cache_dir / ".tmp_detections.json"
    fin = cache_dir / "detections.json"
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _atomic_replace(tmp, fin)


def write_operator_status(
    cache_dir: pathlib.Path,
    *,
    sim_state: str,
    perception_source: str,
    paint_current: Optional[int] = None,
    paint_total: Optional[int] = None,
) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    rgb_path = cache_dir / "rgb.npy"
    rgb_mtime = rgb_path.stat().st_mtime if rgb_path.exists() else None
    meta_path = cache_dir / "meta.json"
    meta: dict = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    age_s = None
    if rgb_mtime is not None:
        age_s = max(0.0, time.time() - rgb_mtime)
    pct = None
    if paint_total and paint_total > 0 and paint_current is not None:
        pct = min(100, int(100 * paint_current / paint_total))
    payload = {
        "sim_state": sim_state,
        "perception_source": perception_source,
        "rgb_age_seconds": age_s,
        "frame_width": meta.get("width"),
        "frame_height": meta.get("height"),
        "paint": None
        if pct is None
        else {"current": paint_current, "total": paint_total, "percent": pct},
    }
    tmp = cache_dir / ".tmp_operator_status.json"
    fin = cache_dir / "operator_status.json"
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    _atomic_replace(tmp, fin)


PERCEPTION_PERIOD_STEPS = 30
MIN_MASK_POINTS = 10

PAINT_MARK_COLOR = (1.0, 1.0, 1.0)
SPRAY_STAMP_RADIUS_M = 0.028
SPRAY_STAMP_DOTS = 10
WAYPOINTS_PER_TICK = 10

PAINT_ENABLED_AT_STARTUP = False

KEYBOARD_HELP = """\
[painter] POC — click the Webots 3D view first.

  YOLO segment → Open3D normals (camera frame) → spray dots on the mesh in **robot base**
  frame (DEF EE_CAMERA pose vs UR5E_BASE).

  Viewport: DEF VIEWPORT_RGB cache + VIEWPORT_RIG synced to MAIN_VIEWPOINT when
  ``--viewport-camera-feed`` runs.

  TAP:
    SPACE   toggle paint (OFF = detect-only)
    1–9     in SELECT: pick that part
    G       snapshot debug PNG
    K       clear paint dots
    H       this help

  SELECT: 0 = cancel to IDLE
"""


# --- Init ---------------------------------------------------------------------


def init():
    robot = Supervisor()
    timestep = int(robot.getBasicTimeStep())

    camera = robot.getDevice(CAMERA_NAME)
    range_finder = robot.getDevice(DEPTH_NAME)
    if camera is None or range_finder is None:
        raise RuntimeError(f"Missing devices '{CAMERA_NAME}' / '{DEPTH_NAME}'.")

    camera.enable(timestep)
    range_finder.enable(timestep)

    keyboard = robot.getKeyboard()
    if keyboard is not None:
        keyboard.enable(timestep)

    base_node = robot.getFromDef(BASE_DEF)
    cam_node = robot.getFromDef(CAMERA_DEF)
    if base_node is None or cam_node is None:
        raise RuntimeError(f"Resolve DEF {BASE_DEF!r} and {CAMERA_DEF!r}.")

    viewport_cam_node = robot.getFromDef(VIEWPORT_RGB_DEF)
    viewport_depth_node = robot.getFromDef(VIEWPORT_DEPTH_DEF)
    viewport_rig_node = robot.getFromDef(VIEWPORT_RIG_DEF)
    viewpoint_node = robot.getFromDef(VIEWPOINT_DEF)
    perception_cam_node = viewport_cam_node if viewport_cam_node is not None else cam_node

    VIEWPORT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if viewport_cam_node is not None:
        print(
            f"[painter] viewport: DEF {VIEWPORT_RGB_DEF!r} -> {VIEWPORT_CACHE_DIR}"
        )
        if viewport_rig_node is not None and viewpoint_node is not None:
            print(f"[painter] VIEWPORT_RIG tracks DEF {VIEWPOINT_DEF!r}")
    else:
        print(f"[painter] no {VIEWPORT_RGB_DEF!r} — using wrist {CAMERA_DEF!r}")

    yolo_model = _load_yolo_model()

    w = camera.getWidth()
    h = camera.getHeight()
    fov_h = camera.getFov()
    intrinsics = _intrinsics_from_fov_vertical(w, h, fov_h)

    print("[painter] POC: normals + paint dots only (no arm motion)")
    print(f"[painter] viewport_cache_dir={VIEWPORT_CACHE_DIR.resolve()}")
    print(f"[painter] paint_cmd path={VIEWPORT_PAINT_CMD_PATH.resolve()}")

    return dict(
        robot=robot,
        timestep=timestep,
        camera=camera,
        range_finder=range_finder,
        keyboard=keyboard,
        base_node=base_node,
        cam_node=cam_node,
        viewport_cam_node=viewport_cam_node,
        viewport_depth_node=viewport_depth_node,
        viewport_rig_node=viewport_rig_node,
        viewpoint_node=viewpoint_node,
        perception_cam_node=perception_cam_node,
        viewport_cache_dir=VIEWPORT_CACHE_DIR,
        yolo_model=yolo_model,
        intrinsics=intrinsics,
        _last_rgb=None,
        _last_depth=None,
        _last_intrinsics=None,
        _last_yolo_result=None,
        _last_single_candidate=None,
        _last_usable_candidates=None,
        _last_perception_source="",
        _viewport_stale_warn_acc=0,
        _last_idle_parts_sig=None,
    )


def _load_yolo_model() -> YOLO:
    if MODEL_PATH_PRIMARY.exists():
        path = str(MODEL_PATH_PRIMARY)
        print(f"[painter] loading weights {path}")
    else:
        path = MODEL_PATH_FALLBACK
        print(f"[painter] using fallback {path}")
    model = YOLO(path)
    model.to(TORCH_DEVICE)
    print(f"[painter] YOLO device: {TORCH_DEVICE}")
    return model


# --- Sensors ------------------------------------------------------------------


def capture(camera, range_finder, intrinsics) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    W, H = intrinsics["width"], intrinsics["height"]
    raw = camera.getImage()
    if raw is None:
        return None, None
    bgra = np.frombuffer(raw, dtype=np.uint8).reshape(H, W, 4)
    rgb = bgra[..., :3][..., ::-1].copy()

    depth_ptr = range_finder.getRangeImage(data_type="buffer")
    if depth_ptr is None:
        return rgb, None
    depth_view = np.ctypeslib.as_array(
        ctypes.cast(depth_ptr, ctypes.POINTER(ctypes.c_float)),
        shape=(H, W),
    )
    depth = depth_view.astype(np.float32, copy=True)
    return rgb, depth


def _intrinsics_from_fov_vertical(width: int, height: int, fov_h: float) -> dict:
    """Build pinhole intrinsics from Webots horizontal FOV.

    Webots reports horizontal FOV. For non-square images (e.g. 640x480), using
    fy == fx introduces vertical reprojection error that shifts lifted points off
    the segmented panel. Compute fov_v from aspect ratio, then fy from fov_v.
    """
    fx = (width / 2.0) / math.tan(fov_h / 2.0)
    fov_v = 2.0 * math.atan((height / float(width)) * math.tan(fov_h / 2.0))
    fy = (height / 2.0) / math.tan(fov_v / 2.0)
    return dict(
        width=width,
        height=height,
        fx=fx,
        fy=fy,
        cx=width / 2.0,
        cy=height / 2.0,
    )


def try_load_viewport_cache(
    cache_dir: pathlib.Path,
) -> Optional[Tuple[np.ndarray, np.ndarray, dict]]:
    rgb_path = cache_dir / "rgb.npy"
    dep_path = cache_dir / "depth.npy"
    meta_path = cache_dir / "meta.json"
    if not (rgb_path.exists() and dep_path.exists() and meta_path.exists()):
        return None
    try:
        age = time.time() - rgb_path.stat().st_mtime
    except OSError:
        return None
    if age > VIEWPORT_FRAME_MAX_AGE_S:
        return None
    try:
        rgb = np.load(rgb_path, allow_pickle=False).copy()
        dep = np.load(dep_path, allow_pickle=False).copy()
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        intr = _intrinsics_from_fov_vertical(
            int(meta["width"]), int(meta["height"]), float(meta["fov_h"])
        )
    except (OSError, json.JSONDecodeError, KeyError, ValueError):
        return None
    if rgb.ndim != 3 or dep.ndim != 2 or rgb.shape[:2] != dep.shape:
        return None
    return rgb, dep, intr


def capture_perception(ctx):
    if ctx.get("viewport_cam_node") is not None:
        loaded = try_load_viewport_cache(ctx["viewport_cache_dir"])
        if loaded is not None:
            rgb, dep, intr = loaded
            if rgb is not None and dep is not None:
                # RGB/depth/intrinsics are from the viewport cache → use viewport pose.
                ctx["_reprojection_cam_node"] = ctx["viewport_cam_node"]
                return rgb, dep, intr, "viewport"
        ctx["_viewport_stale_warn_acc"] = int(ctx.get("_viewport_stale_warn_acc", 0)) + 1
        if ctx["_viewport_stale_warn_acc"] % 120 == 1:
            print(
                "[painter] viewport cache stale — is --viewport-camera-feed running?"
            )

    # Wrist camera image + intrinsics → must use EE_CAMERA pose, not viewport DEF.
    ctx["_reprojection_cam_node"] = ctx["cam_node"]
    rgb, dep = capture(ctx["camera"], ctx["range_finder"], ctx["intrinsics"])
    return rgb, dep, ctx["intrinsics"], "wrist"


# --- YOLO ---------------------------------------------------------------------


def detect_all_targets(rgb: np.ndarray, model: YOLO) -> Tuple[List[dict], object]:
    results = model.predict(rgb, device=TORCH_DEVICE, conf=YOLO_CONFIDENCE, verbose=False)
    target_classes = {"car"} if DEBUG_USE_COCO_FALLBACK else TARGET_CLASSES

    if not results:
        return [], None
    res = results[0]

    if res.boxes is None or len(res.boxes) == 0:
        print(f"[painter][IDLE] YOLO: 0 detections at conf>={YOLO_CONFIDENCE:.2f}")
        return [], res
    if res.masks is None:
        print("[painter][IDLE] no segmentation masks")
        return [], res

    names = res.names
    classes = res.boxes.cls.cpu().numpy().astype(int)
    confs = res.boxes.conf.cpu().numpy()
    masks = res.masks.data.cpu().numpy()

    order = np.argsort(-confs)
    H, W = rgb.shape[:2]
    cands: List[dict] = []
    for idx in order:
        cls_name = names[int(classes[idx])]
        if cls_name not in target_classes:
            continue
        m = masks[idx]
        if m.shape != (H, W):
            m = cv2.resize(m, (W, H), interpolation=cv2.INTER_NEAREST)
        mask_bool = m > 0.5
        if not mask_bool.any():
            continue
        u, v = _mask_centroid(mask_bool)
        conf = float(confs[idx])
        cands.append(
            dict(mask_bool=mask_bool, u=int(u), v=int(v), cls_name=cls_name, conf=conf)
        )

    if not cands:
        top = order[:DETECTION_DEBUG_TOPK]
        seen = ", ".join(f"{names[int(classes[i])]}({confs[i]:.2f})" for i in top)
        print(f"[painter][IDLE] no TARGET_CLASSES match; top seen: {seen}")
    return cands, res


def _mask_centroid(mask_bool: np.ndarray) -> Tuple[int, int]:
    M = cv2.moments(mask_bool.astype(np.uint8))
    if M["m00"] == 0:
        ys, xs = np.where(mask_bool)
        return int(xs.mean()), int(ys.mean())
    u = int(round(M["m10"] / M["m00"]))
    v = int(round(M["m01"] / M["m00"]))
    return u, v


def resolve_operator_mask_png_path(mask_uri: str) -> Optional[pathlib.Path]:
    """Map API/DB mask_uri to on-disk PNG under viewport_cache/mask_exports."""
    if not mask_uri or not isinstance(mask_uri, str):
        return None
    s = mask_uri.strip().split("?")[0].replace("\\", "/")
    marker = "sim/runtime/masks/"
    tail = ""
    if marker in s:
        tail = s.split(marker, 1)[1].strip("/").split("/")[-1]
    else:
        m = re.search(r"/sim/runtime/masks/([^/?#]+\.png)", s, re.IGNORECASE)
        if m:
            tail = m.group(1)
        else:
            m2 = re.search(r"([^/?#]+\.png)$", s)
            if m2:
                cand = VIEWPORT_CACHE_DIR / "mask_exports" / m2.group(1)
                if cand.is_file():
                    return cand
    if tail.endswith(".png"):
        return VIEWPORT_CACHE_DIR / "mask_exports" / tail
    if s.endswith(".png") and "/" not in s:
        p = VIEWPORT_CACHE_DIR / "mask_exports" / s
        if p.is_file():
            return p
    return None


def load_mask_bool_from_png_file(
    path: pathlib.Path, height: int, width: int
) -> Optional[np.ndarray]:
    if not path.is_file():
        print(f"[painter][mask] PNG not found: {path.resolve()}")
        return None
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im is None:
        print(f"[painter][mask] cv2.imread failed: {path}")
        return None
    # Foreground: luminance (or alpha-weighted) >= 128 matches UI/editor midpoint;
    # avoids shaving anti-aliased edges that sit at 127 after resize.
    if im.ndim == 2:
        gray_u8 = im
        mb = gray_u8 >= 128
    elif im.ndim == 3 and im.shape[2] == 4:
        # Browser PNGs use A=255 on both background and foreground; OR-ing (a > 127)
        # would mark the whole image as mask. Use BGR luminance only.
        bgr = im[:, :, :3]
        gray_u8 = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        a = im[:, :, 3]
        if int(a.min()) < 250:
            mb = (gray_u8 >= 128) & (a >= 128)
        else:
            mb = gray_u8 >= 128
    elif im.ndim == 3 and im.shape[2] >= 3:
        gray_u8 = cv2.cvtColor(im[:, :, :3], cv2.COLOR_BGR2GRAY)
        mb = gray_u8 >= 128
    else:
        return None
    if mb.shape != (height, width):
        mb = cv2.resize(mb.astype(np.uint8), (width, height), interpolation=cv2.INTER_NEAREST) > 0
    return mb


def merge_operator_mask_into_det(
    det: dict,
    mask_uri: Optional[str],
    frame_hw: Tuple[int, int],
    *,
    log_tag: str = "API",
) -> dict:
    """Use approved/edited mask PNG from disk instead of YOLO mask_bool when available."""
    if not mask_uri:
        return det
    path = resolve_operator_mask_png_path(mask_uri)
    if path is None:
        print(
            f"[painter][{log_tag}] could not resolve mask_uri {mask_uri!r} — using YOLO mask"
        )
        return det
    h, w = int(frame_hw[0]), int(frame_hw[1])
    mb = load_mask_bool_from_png_file(path, h, w)
    if mb is None or not mb.any():
        print(
            f"[painter][{log_tag}] operator mask empty or unreadable {path} — using YOLO mask"
        )
        return det
    out = dict(det)
    out["mask_bool"] = mb
    # Lift every mask pixel with valid depth — do not apply _front_surface_mask MAD pruning,
    # or paint coverage will not match the approved PNG (creases / mixed-depth edges drop out).
    out["_strict_operator_mask"] = True
    u, v = _mask_centroid(mb)
    out["u"], out["v"] = int(u), int(v)
    yolo_px = int(det["mask_bool"].sum()) if "mask_bool" in det else -1
    print(
        f"[painter][{log_tag}] using operator mask {path.name}: {int(mb.sum())} px "
        f"centroid=({u},{v}) (YOLO was {yolo_px} px)"
    )
    return out


def _save_debug_frames(
    rgb: np.ndarray,
    depth: np.ndarray,
    yolo_result,
    target_uv: Optional[Tuple[int, int]] = None,
    snapshot_label: Optional[str] = None,
) -> None:
    if not DEBUG_SAVE_FRAMES and snapshot_label is None:
        return
    DEBUG_FRAME_DIR.mkdir(parents=True, exist_ok=True)

    if yolo_result is not None and hasattr(yolo_result, "plot"):
        try:
            annotated = yolo_result.plot()
        except Exception:
            annotated = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    else:
        annotated = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    if target_uv is not None:
        cv2.drawMarker(
            annotated,
            (int(target_uv[0]), int(target_uv[1])),
            color=(0, 255, 255),
            markerType=cv2.MARKER_CROSS,
            markerSize=24,
            thickness=2,
        )

    cv2.imwrite(str(DEBUG_FRAME_LATEST), annotated)

    if depth is not None:
        d = np.where(np.isfinite(depth), depth, 0.0)
        d = np.clip(d, 0.0, 3.0)
        d_vis = (d / 3.0 * 255.0).astype(np.uint8)
        d_vis = cv2.applyColorMap(d_vis, cv2.COLORMAP_TURBO)
        cv2.imwrite(str(DEBUG_DEPTH_LATEST), d_vis)

    if snapshot_label is not None:
        import datetime as _dt

        stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        rgb_path = DEBUG_FRAME_DIR / f"{stamp}_{snapshot_label}_rgb.png"
        cv2.imwrite(str(rgb_path), annotated)
        print(f"[painter][KBD] saved {rgb_path}")


# --- Geometry -----------------------------------------------------------------


def _fill_depth_under_mask(
    mask_bool: np.ndarray, depth: np.ndarray
) -> Optional[np.ndarray]:
    d = np.asarray(depth, dtype=np.float64).copy()
    finite = np.isfinite(d) & (d > 1e-6)
    if not mask_bool.any():
        return d
    mf = mask_bool & finite
    if mf.any():
        fill_z = float(np.median(d[mf]))
    elif finite.any():
        fill_z = float(np.median(d[finite]))
    else:
        return None
    bad = mask_bool & (~np.isfinite(d) | (d <= 1e-6))
    d[bad] = fill_z
    return d


def _front_surface_mask(mask_bool: np.ndarray, depth_use: np.ndarray) -> np.ndarray:
    """Keep the dominant/front depth layer inside the segmentation mask.

    Tesla windows and glossy regions can expose interior depth points (seats/cabin),
    which pulls the reconstructed cloud away from the exterior panel. We keep points
    close to the front layer (robust median + MAD gate) so paint dots land on the
    visible outer body surface.
    """
    valid = mask_bool & np.isfinite(depth_use) & (depth_use > 0.0)
    if not valid.any():
        return valid

    z = depth_use[valid]
    z_med = float(np.median(z))
    z_mad = float(np.median(np.abs(z - z_med)))
    # 6 cm minimum gate handles quantization noise; wider gate if mask itself is noisy.
    gate = max(0.06, 2.5 * z_mad)
    front = valid & (np.abs(depth_use - z_med) <= gate)

    # If gate over-prunes, fall back to the full valid mask.
    if int(np.count_nonzero(front)) < 25:
        return valid
    return front


def pixels_to_camera_frame(
    mask_bool: np.ndarray,
    depth: np.ndarray,
    target_uv: Tuple[int, int],
    intrinsics: dict,
    *,
    strict_operator_mask: bool = False,
) -> Tuple[Optional[np.ndarray], Optional[int]]:
    fx, fy = intrinsics["fx"], intrinsics["fy"]
    cx, cy = intrinsics["cx"], intrinsics["cy"]

    depth_use = _fill_depth_under_mask(mask_bool, depth)
    if depth_use is None:
        return None, None

    base_valid = mask_bool & np.isfinite(depth_use) & (depth_use > 1e-6)
    if strict_operator_mask:
        valid = base_valid
    else:
        valid = _front_surface_mask(mask_bool, depth_use)
    if not valid.any():
        return None, None

    vs, us = np.where(valid)
    r = depth_use[vs, us].astype(np.float64)  # RangeFinder distance along each pixel ray.

    # Camera frame in Webots: +X forward, +Y left, +Z up.
    # Pixel ray (unnormalized): [1, -(u-cx)/fx, -(v-cy)/fy].
    dy = -(us - cx) / fx
    dz = -(vs - cy) / fy
    ray_norm = np.sqrt(1.0 + dy * dy + dz * dz)

    # Convert ray distance -> Cartesian point: p = r * (ray / ||ray||).
    x_fwd = r / ray_norm
    y_left = dy * x_fwd
    z_up = dz * x_fwd
    points = np.stack([x_fwd, y_left, z_up], axis=1)

    tu, tv = target_uv
    matches = np.where((us == tu) & (vs == tv))[0]
    if matches.size > 0:
        target_idx = int(matches[0])
    else:
        d2 = (us - tu) ** 2 + (vs - tv) ** 2
        target_idx = int(np.argmin(d2))

    return points, target_idx


def estimate_surface_cloud(points_cam: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points_cam)
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.05, max_nn=30)
    )
    pcd.orient_normals_towards_camera_location(np.zeros(3))

    points = np.asarray(pcd.points, dtype=np.float64).copy()
    normals = np.asarray(pcd.normals, dtype=np.float64).copy()
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = np.divide(
        normals, np.maximum(norms, 1e-9), out=np.zeros_like(normals), where=norms > 0
    )
    return points, normals


def sync_viewport_rig_to_navigation_viewpoint(ctx) -> None:
    vp = ctx.get("viewpoint_node")
    rig = ctx.get("viewport_rig_node")
    if vp is None or rig is None:
        return
    try:
        pos = vp.getField("position").getSFVec3f()
        ori = vp.getField("orientation").getSFRotation()
    except (AttributeError, TypeError, RuntimeError):
        return
    try:
        rig.getField("translation").setSFVec3f(pos)
        rig.getField("rotation").setSFRotation(ori)
    except (AttributeError, TypeError, RuntimeError):
        return
    try:
        fov = float(vp.getField("fieldOfView").getSFFloat())
        vcam = ctx.get("viewport_cam_node")
        vdep = ctx.get("viewport_depth_node")
        if vcam is not None:
            vcam.getField("fieldOfView").setSFFloat(fov)
        if vdep is not None:
            vdep.getField("fieldOfView").setSFFloat(fov)
    except (AttributeError, TypeError, RuntimeError, ValueError):
        pass


def _matrix_to_axis_angle(R: np.ndarray) -> list[float]:
    tr = float(np.trace(R))
    cos_a = max(-1.0, min(1.0, (tr - 1.0) * 0.5))
    angle = math.acos(cos_a)
    if abs(angle) < 1e-9:
        return [0.0, 1.0, 0.0, 0.0]
    s = 2.0 * math.sin(angle)
    if abs(s) < 1e-9:
        axis = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    else:
        axis = np.array(
            [
                (R[2, 1] - R[1, 2]) / s,
                (R[0, 2] - R[2, 0]) / s,
                (R[1, 0] - R[0, 1]) / s,
            ],
            dtype=np.float64,
        )
    n = float(np.linalg.norm(axis))
    if n < 1e-9:
        axis = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    else:
        axis = axis / n
    return [float(axis[0]), float(axis[1]), float(axis[2]), float(angle)]


def apply_frontend_camera_control(ctx) -> None:
    vp = ctx.get("viewpoint_node")
    if vp is None or not VIEWPORT_CAMERA_CMD_PATH.exists():
        return
    try:
        payload = json.loads(VIEWPORT_CAMERA_CMD_PATH.read_text(encoding="utf-8"))
        VIEWPORT_CAMERA_CMD_PATH.unlink(missing_ok=True)
    except (OSError, json.JSONDecodeError):
        return

    dx = float(payload.get("dx", 0.0))
    dy = float(payload.get("dy", 0.0))
    zoom = float(payload.get("zoom", 0.0))
    state = ctx.setdefault(
        "_remote_cam_orbit",
        {"yaw": -2.2, "pitch": 0.22, "distance": 6.0, "target": [0.0, 1.4, 0.7]},
    )
    state["yaw"] += dx * 0.01
    state["pitch"] = float(np.clip(state["pitch"] + dy * 0.01, -1.1, 1.1))
    state["distance"] = float(np.clip(state["distance"] - zoom * 0.2, 2.0, 14.0))

    target = np.array(state["target"], dtype=np.float64)
    yaw = float(state["yaw"])
    pitch = float(state["pitch"])
    dist = float(state["distance"])
    cam_pos = target + np.array(
        [
            dist * math.cos(pitch) * math.sin(yaw),
            dist * math.sin(pitch),
            dist * math.cos(pitch) * math.cos(yaw),
        ],
        dtype=np.float64,
    )
    forward = target - cam_pos
    fn = float(np.linalg.norm(forward))
    if fn < 1e-6:
        return
    forward /= fn
    world_up = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    right = np.cross(world_up, forward)
    rn = float(np.linalg.norm(right))
    if rn < 1e-6:
        return
    right /= rn
    up = np.cross(forward, right)
    up /= max(float(np.linalg.norm(up)), 1e-9)

    # local axes in world coordinates (Webots camera forward is local -Z)
    R = np.column_stack((right, up, -forward))
    axis_angle = _matrix_to_axis_angle(R)

    try:
        vp.getField("position").setSFVec3f(cam_pos.tolist())
        vp.getField("orientation").setSFRotation(axis_angle)
    except (AttributeError, TypeError, RuntimeError):
        return


def try_consume_paint_command() -> Optional[dict]:
    if not VIEWPORT_PAINT_CMD_PATH.exists():
        return None
    try:
        raw = VIEWPORT_PAINT_CMD_PATH.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"[painter][API] paint_cmd read failed ({VIEWPORT_PAINT_CMD_PATH}): {exc!r}")
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"[painter][API] paint_cmd JSON invalid: {exc!r}")
        return None
    try:
        VIEWPORT_PAINT_CMD_PATH.unlink(missing_ok=True)
    except OSError as exc:
        print(
            f"[painter][API] paint_cmd unlink failed (check permissions; file={VIEWPORT_PAINT_CMD_PATH}): {exc!r}"
        )
        return None
    part = payload.get("part_class")
    if isinstance(part, str):
        payload["part_class"] = part.strip().lower()
    else:
        payload["part_class"] = None
    return payload


def camera_to_base_transform(cam_node, base_node) -> np.ndarray:
    flat = cam_node.getPose(base_node)
    return np.array(flat, dtype=np.float64).reshape(4, 4)


# --- Paint visualization ------------------------------------------------------


def _ensure_paint_layer(robot, paint_state: dict) -> bool:
    """Create/reuse a single PointSet layer for fast paint accumulation."""
    if paint_state.get("point_field") is not None:
        return True
    node = robot.getFromDef("PAINT_POINTSET")
    if node is None:
        r, g, b = PAINT_MARK_COLOR
        proto = (
            "DEF PAINT_POINTSET Shape { "
            "appearance Appearance { "
            f"material Material {{ diffuseColor {r} {g} {b} "
            f"emissiveColor {r*0.45:.3f} {g*0.45:.3f} {b*0.45:.3f} "
            "ambientIntensity 0.4 shininess 0.1 } } "
            "geometry PointSet { "
            "coord Coordinate { point [ ] } "
            "} }"
        )
        children_field = robot.getRoot().getField("children")
        try:
            children_field.importMFNodeFromString(-1, proto)
        except Exception as exc:
            print(f"[painter] create paint layer failed: {exc!r}")
            return False
        node = robot.getFromDef("PAINT_POINTSET")
    if node is None:
        return False
    try:
        geom = node.getField("geometry").getSFNode()
        coord = geom.getField("coord").getSFNode()
        paint_state["shape_node"] = node
        paint_state["point_field"] = coord.getField("point")
        paint_state["count"] = int(paint_state.get("count", 0))
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[painter] bind paint layer failed: {exc!r}")
        return False


def _append_paint_point(robot, base_node, surface_pt_base: np.ndarray, paint_state: dict) -> None:
    if not _ensure_paint_layer(robot, paint_state):
        return
    base_pose = np.array(base_node.getPose(), dtype=np.float64).reshape(4, 4)
    p = np.asarray(surface_pt_base, dtype=np.float64)
    world_pt = base_pose[:3, :3] @ p + base_pose[:3, 3]
    try:
        paint_state["point_field"].insertMFVec3f(-1, world_pt.tolist())
        paint_state["count"] = int(paint_state.get("count", 0)) + 1
    except Exception as exc:  # noqa: BLE001
        print(f"[painter] append paint point failed: {exc!r}")


def _build_tangent_frame(normal: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    n = np.asarray(normal, dtype=np.float64)
    nn = np.linalg.norm(n)
    if nn < 1e-9:
        n = np.array([1.0, 0.0, 0.0], dtype=np.float64)
    else:
        n = n / nn
    helper = np.array([0.0, 0.0, 1.0], dtype=np.float64)
    if abs(float(np.dot(helper, n))) > 0.9:
        helper = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    t1 = np.cross(n, helper)
    t1 /= np.linalg.norm(t1) + 1e-9
    t2 = np.cross(n, t1)
    t2 /= np.linalg.norm(t2) + 1e-9
    return t1, t2


def deposit_spray_stamp(
    robot,
    base_node,
    surface_pt_base: np.ndarray,
    surface_normal_base: np.ndarray,
    paint_state: dict,
    rng: np.random.Generator,
) -> None:
    """Drop a small spray-like cluster around one raster point."""
    t1, t2 = _build_tangent_frame(surface_normal_base)
    for _ in range(SPRAY_STAMP_DOTS):
        # Uniform disk sample in tangent plane.
        r = SPRAY_STAMP_RADIUS_M * math.sqrt(float(rng.random()))
        a = 2.0 * math.pi * float(rng.random())
        offset = (math.cos(a) * r) * t1 + (math.sin(a) * r) * t2
        _append_paint_point(robot, base_node, surface_pt_base + offset, paint_state)


def clear_paint_marks(paint_state: dict) -> int:
    n = int(paint_state.get("count", 0))
    node = paint_state.get("shape_node")
    if node is not None:
        try:
            node.remove()
        except (AttributeError, RuntimeError):
            pass
    paint_state.clear()
    paint_state["count"] = 0
    return n


# --- Planning -----------------------------------------------------------------


def build_plan_from_detection(
    ctx,
    rgb: np.ndarray,
    depth: np.ndarray,
    intrinsics: dict,
    det: dict,
    yolo_result,
    *,
    log_tag: str = "IDLE",
) -> Optional[dict]:
    mask_bool = det["mask_bool"]
    u, v = det["u"], det["v"]
    cls_name = det["cls_name"]
    conf = float(det["conf"])
    strict_op = bool(det.get("_strict_operator_mask"))
    _save_debug_frames(rgb, depth, yolo_result, target_uv=(u, v))

    points_cam_raw, target_idx = pixels_to_camera_frame(
        mask_bool,
        depth,
        (u, v),
        intrinsics,
        strict_operator_mask=strict_op,
    )
    if points_cam_raw is None or target_idx is None:
        print(f"[painter][{log_tag}] {cls_name!r} at ({u},{v}): no depth")
        return None
    if len(points_cam_raw) < MIN_MASK_POINTS:
        print(f"[painter][{log_tag}] {cls_name!r}: sparse mask ({len(points_cam_raw)} pts)")
        return None

    # Keep the centroid's geometric meaning across Open3D processing: point ordering can
    # change, so the original index is not guaranteed to refer to the same spatial point.
    target_point_cam = np.asarray(points_cam_raw[target_idx], dtype=np.float64).copy()
    points_cam, normals_cam = estimate_surface_cloud(points_cam_raw)
    d2_anchor = np.sum((points_cam - target_point_cam) ** 2, axis=1)
    target_idx = int(np.argmin(d2_anchor))

    cam_for_proj = ctx.get("_reprojection_cam_node") or ctx["perception_cam_node"]
    T_base_cam = camera_to_base_transform(cam_for_proj, ctx["base_node"])
    R = T_base_cam[:3, :3]
    t = T_base_cam[:3, 3]
    points_base = points_cam @ R.T + t
    normals_base = normals_cam @ R.T
    norms = np.linalg.norm(normals_base, axis=1, keepdims=True)
    normals_base = np.divide(
        normals_base,
        np.maximum(norms, 1e-9),
        out=np.zeros_like(normals_base),
        where=norms > 0,
    )

    anchor_point = points_base[target_idx]
    anchor_normal = normals_base[target_idx]

    waypoints, bbox = build_surface_waypoints(points_base, normals_base, target_idx)
    n_wp = len(waypoints)
    if n_wp < MIN_WAYPOINTS:
        print(f"[painter][{log_tag}] {cls_name!r}: no paint waypoints")
        return None
    # Avoid log floods: IDLE churn calls this every perception tick while paint is off.
    if log_tag != "IDLE":
        print(f"[painter][PLAN] {cls_name!r}: {n_wp} surface poses (direct mask lift)")
    return dict(
        cls_name=cls_name,
        conf=conf,
        u=int(u),
        v=int(v),
        anchor_point_base=anchor_point,
        anchor_normal_base=anchor_normal,
        bbox=bbox,
        waypoints=waypoints,
    )


def plan_target_from_perception(ctx, paint_enabled: bool) -> Optional[dict]:
    rgb, depth, intrinsics, src = capture_perception(ctx)
    if rgb is None or depth is None:
        ctx["_last_single_candidate"] = None
        ctx["_last_usable_candidates"] = []
        export_operator_detections(VIEWPORT_CACHE_DIR, [], "none")
        return None

    ctx["_last_rgb"] = rgb
    ctx["_last_depth"] = depth
    ctx["_last_intrinsics"] = intrinsics
    ctx["_last_perception_source"] = src

    candidates, yolo_result = detect_all_targets(rgb, ctx["yolo_model"])
    ctx["_last_yolo_result"] = yolo_result

    if not candidates:
        ctx["_last_single_candidate"] = None
        ctx["_last_usable_candidates"] = []
        _save_debug_frames(rgb, depth, yolo_result)
        export_operator_detections(VIEWPORT_CACHE_DIR, [], src)
        return None

    usable_raw = [c for c in candidates if c["conf"] >= PAINT_CONFIDENCE_MIN]
    # Keep one candidate per class (highest confidence) to avoid duplicate menu rows
    # such as front_left_door appearing multiple times from overlapping masks.
    best_by_class: dict = {}
    for c in usable_raw:
        prev = best_by_class.get(c["cls_name"])
        if prev is None or float(c["conf"]) > float(prev["conf"]):
            best_by_class[c["cls_name"]] = c
    usable = sorted(best_by_class.values(), key=lambda c: float(c["conf"]), reverse=True)
    ctx["_last_usable_candidates"] = list(usable)
    export_operator_detections(VIEWPORT_CACHE_DIR, usable, src)
    if not usable:
        ctx["_last_single_candidate"] = None
        ctx["_last_usable_candidates"] = []
        ctx["_last_idle_parts_sig"] = None
        _save_debug_frames(rgb, depth, yolo_result)
        summary = ", ".join(
            f"{c['cls_name']}({c['conf']:.2f})" for c in candidates[:DETECTION_DEBUG_TOPK]
        )
        print(f"[painter][IDLE] below PAINT_CONF_MIN: {summary}")
        return None

    if len(usable) >= 2 and paint_enabled:
        ctx["_last_single_candidate"] = None
        ctx["_last_idle_parts_sig"] = None
        return {
            "__select__": True,
            "candidates": usable,
            "rgb": rgb,
            "depth": depth,
            "intrinsics": intrinsics,
            "yolo_result": yolo_result,
        }

    if len(usable) >= 2 and not paint_enabled:
        ctx["_last_single_candidate"] = None
        sig = tuple((c["cls_name"], round(float(c["conf"]), 2)) for c in usable)
        if sig != ctx.get("_last_idle_parts_sig"):
            lines = "\n".join(
                f"    [{i + 1}] {c['cls_name']} conf={c['conf']:.2f}"
                for i, c in enumerate(usable)
            )
            print(f"[painter][IDLE] {len(usable)} parts (SPACE to choose):\n{lines}")
            ctx["_last_idle_parts_sig"] = sig
        _save_debug_frames(rgb, depth, yolo_result)
        return None

    ctx["_last_idle_parts_sig"] = None
    only = usable[0]
    ctx["_last_single_candidate"] = only
    return build_plan_from_detection(ctx, rgb, depth, intrinsics, only, yolo_result)


def build_surface_waypoints(
    points_base: np.ndarray,
    normals_base: np.ndarray,
    anchor_idx: int,
) -> Tuple[list, Tuple[float, float]]:
    """POC paint path directly from segmented surface points.

    Avoids tangent-grid snap misses on curved/oblique panels by using the lifted mask
    surface itself. We keep deterministic ordering and optional thinning for runtime.
    """
    n = int(points_base.shape[0])
    if n <= 0:
        return [], (0.0, 0.0)

    # Runtime guard: not a hard geometric cap, just deterministic thinning when masks
    # are very dense (e.g. >10k points) so painting remains interactive.
    step = max(1, n // 2200)
    idxs = np.arange(0, n, step, dtype=int)
    pts = points_base[idxs]
    nrm = normals_base[idxs]

    # Sort by base-frame Y then Z to create a stable sweep-like order.
    order = np.lexsort((pts[:, 2], pts[:, 1]))
    pts = pts[order]
    nrm = nrm[order]

    waypoints = []
    for p, nn in zip(pts, nrm):
        waypoints.append((p + STANDOFF_M * nn, -nn, p))

    # Keep bbox reporting consistent with previous logs (anchor tangent frame extents).
    anchor_point = points_base[anchor_idx]
    anchor_normal = normals_base[anchor_idx]
    helper = np.array([0.0, 0.0, 1.0])
    if abs(np.dot(helper, anchor_normal)) > 0.95:
        helper = np.array([0.0, 1.0, 0.0])
    tangent_a = np.cross(anchor_normal, helper)
    tangent_a /= np.linalg.norm(tangent_a) + 1e-9
    tangent_b = np.cross(anchor_normal, tangent_a)
    tangent_b /= np.linalg.norm(tangent_b) + 1e-9
    delta = points_base - anchor_point
    u_extent = float(np.max(delta @ tangent_a) - np.min(delta @ tangent_a))
    v_extent = float(np.max(delta @ tangent_b) - np.min(delta @ tangent_b))
    return waypoints, (max(0.0, u_extent), max(0.0, v_extent))


# --- Main ---------------------------------------------------------------------


def main():
    ctx = init()
    robot = ctx["robot"]
    timestep = ctx["timestep"]
    keyboard = ctx["keyboard"]

    print(KEYBOARD_HELP)

    state = "IDLE"
    state_tick = 0
    plan = None
    pending_select = None
    paint_enabled = PAINT_ENABLED_AT_STARTUP
    last_pressed: set = set()
    paint_state: dict = {"count": 0}
    rng = np.random.default_rng(7)

    print(f"[painter] IDLE (paint_enabled={paint_enabled})")

    while robot.step(timestep) != -1:
        cmd = try_consume_paint_command()
        if cmd is not None:
            ctx["_remote_paint_request"] = cmd
            paint_enabled = True
            req_cls = cmd.get("part_class")
            print(
                "[painter][API] paint command received"
                + (f" part={req_cls}" if req_cls else "")
            )
        apply_frontend_camera_control(ctx)
        sync_viewport_rig_to_navigation_viewpoint(ctx)
        state_tick += 1

        if state_tick % 15 == 0:
            src = str(ctx.get("_last_perception_source", ""))
            pc: Optional[int] = None
            pt: Optional[int] = None
            if state == "PAINT" and plan is not None:
                n_wp_live = len(plan["waypoints"])
                if n_wp_live > 0:
                    pc = min(int(plan.get("paint_idx", 0)) + 1, n_wp_live)
                    pt = n_wp_live
            write_operator_status(
                VIEWPORT_CACHE_DIR,
                sim_state=state,
                perception_source=src,
                paint_current=pc,
                paint_total=pt,
            )

        keys_now: set = set()
        if keyboard is not None:
            k = keyboard.getKey()
            while k != -1:
                keys_now.add(k & 0xFFFF)
                k = keyboard.getKey()
        new_presses = keys_now - last_pressed
        last_pressed = keys_now

        for key in new_presses:
            if state == "SELECT" and pending_select is not None:
                if key == ord("0"):
                    print("[painter][SELECT] cancelled")
                    pending_select = None
                    plan = None
                    state, state_tick = "IDLE", 0
                    continue
                if ord("1") <= key <= ord("9"):
                    idx = key - ord("1")
                    cand_list = pending_select["candidates"]
                    if not (0 <= idx < len(cand_list)):
                        print(f"[painter][SELECT] press 1-{len(cand_list)} or 0")
                        continue
                    chosen = cand_list[idx]
                    plan_try = build_plan_from_detection(
                        ctx,
                        pending_select["rgb"],
                        pending_select["depth"],
                        pending_select["intrinsics"],
                        chosen,
                        pending_select["yolo_result"],
                        log_tag="PLAN",
                    )
                    if plan_try is None:
                        print(f"[painter][SELECT] no plan for {chosen['cls_name']!r}")
                        continue
                    pending_select = None
                    plan = plan_try
                    plan["paint_idx"] = 0
                    plan["paint_waypoint_tick"] = 0
                    u_ext, v_ext = plan["bbox"]
                    n_wp = len(plan["waypoints"])
                    print(
                        f"[painter][PLAN] {plan['cls_name']} bbox={u_ext:.2f}×{v_ext:.2f}m "
                        f"waypoints={n_wp}"
                    )
                    state, state_tick = "PAINT", 0
                    continue
            if key == ord(" "):
                paint_enabled = not paint_enabled
                print(f"[painter][KBD] paint_enabled = {paint_enabled}")
                if not paint_enabled and state in ("PAINT", "SELECT"):
                    plan = None
                    pending_select = None
                    state, state_tick = "IDLE", 0
            elif key in (ord("G"), ord("g")):
                if ctx["_last_rgb"] is None:
                    print("[painter][KBD] no frame yet")
                else:
                    _save_debug_frames(
                        ctx["_last_rgb"],
                        ctx["_last_depth"],
                        ctx["_last_yolo_result"],
                        snapshot_label="snapshot",
                    )
            elif key in (ord("K"), ord("k")):
                n = clear_paint_marks(paint_state)
                print(f"[painter][KBD] cleared {n} mark(s)")
            elif key in (ord("H"), ord("h")):
                print(KEYBOARD_HELP)

        if state == "SELECT":
            # Remote paint job must not stay stuck behind keyboard SELECT.
            if ctx.get("_remote_paint_request") is not None:
                print("[painter][API] paint command clears keyboard SELECT → IDLE")
                pending_select = None
                state, state_tick = "IDLE", 0
            else:
                continue

        if state == "IDLE":
            if state_tick % PERCEPTION_PERIOD_STEPS != 0:
                continue
            remote_req = ctx.get("_remote_paint_request")
            wants_paint = paint_enabled or remote_req is not None
            try:
                plan = plan_target_from_perception(ctx, wants_paint)
            except Exception as exc:
                print(f"[painter] perception error: {exc!r}")
                plan = None
                continue
            if plan is None:
                continue
            remote_req = ctx.get("_remote_paint_request")
            wants_paint = paint_enabled or remote_req is not None
            if isinstance(plan, dict) and plan.get("__select__"):
                if remote_req is not None:
                    req_cls = str(remote_req.get("part_class") or "").strip().lower()
                    chosen = None
                    for c in plan["candidates"]:
                        if not req_cls or c["cls_name"].strip().lower() == req_cls:
                            chosen = c
                            break
                    if chosen is None:
                        print(
                            f"[painter][API] requested part not found: {req_cls!r}; waiting next frame"
                        )
                        continue
                    chosen_use = merge_operator_mask_into_det(
                        chosen,
                        remote_req.get("mask_uri"),
                        (plan["rgb"].shape[0], plan["rgb"].shape[1]),
                        log_tag="API",
                    )
                    plan_try = build_plan_from_detection(
                        ctx,
                        plan["rgb"],
                        plan["depth"],
                        plan["intrinsics"],
                        chosen_use,
                        plan["yolo_result"],
                        log_tag="API",
                    )
                    if plan_try is None:
                        print(
                            f"[painter][API] no paint plan for requested part {chosen['cls_name']!r}"
                        )
                        continue
                    ctx["_remote_paint_request"] = None
                    plan = plan_try
                    plan["paint_idx"] = 0
                    plan["paint_waypoint_tick"] = 0
                    state, state_tick = "PAINT", 0
                    continue
                pending_select = {
                    "candidates": plan["candidates"],
                    "rgb": plan["rgb"],
                    "depth": plan["depth"],
                    "intrinsics": plan["intrinsics"],
                    "yolo_result": plan["yolo_result"],
                }
                n = len(pending_select["candidates"])
                src = ctx.get("_last_perception_source", "?")
                print(f"[painter][SELECT] {n} parts ({src}) — 1-{n} to paint, 0 cancel:")
                for i, c in enumerate(pending_select["candidates"]):
                    print(f"  [{i + 1}] {c['cls_name']}  conf={c['conf']:.2f}")
                plan = None
                state, state_tick = "SELECT", 0
                continue

            if remote_req is not None:
                # Match paint job part_class to the correct YOLO candidate — not usable[0]
                # (highest conf), which can be a different panel than the operator picked in UI.
                req_cls = str(remote_req.get("part_class") or "").strip().lower()
                rgb = ctx.get("_last_rgb")
                depth = ctx.get("_last_depth")
                intrinsics = ctx.get("_last_intrinsics")
                yolo = ctx.get("_last_yolo_result")
                candidates = list(ctx.get("_last_usable_candidates") or [])
                if (
                    rgb is None
                    or depth is None
                    or intrinsics is None
                    or yolo is None
                    or not candidates
                ):
                    print(
                        "[painter][API] waiting for perception + YOLO list to apply operator mask"
                    )
                    continue
                chosen = None
                if req_cls:
                    for c in candidates:
                        if str(c["cls_name"]).strip().lower() == req_cls:
                            chosen = c
                            break
                if chosen is None and len(candidates) == 1:
                    chosen = candidates[0]
                if chosen is None:
                    names = [c["cls_name"] for c in candidates]
                    print(
                        f"[painter][API] job wants part {req_cls!r} but last detections are "
                        f"{names} — run Inspection for that part or wait until it dominates"
                    )
                    continue
                chosen_use = merge_operator_mask_into_det(
                    chosen,
                    remote_req.get("mask_uri"),
                    (rgb.shape[0], rgb.shape[1]),
                    log_tag="API",
                )
                plan_try = build_plan_from_detection(
                    ctx, rgb, depth, intrinsics, chosen_use, yolo, log_tag="API"
                )
                if plan_try is None:
                    print("[painter][API] plan with operator mask failed — check mask vs depth")
                    continue
                ctx["_remote_paint_request"] = None
                plan = plan_try
                plan["paint_idx"] = 0
                plan["paint_waypoint_tick"] = 0
                u_ext, v_ext = plan["bbox"]
                n_wp = len(plan["waypoints"])
                print(
                    f"[painter][PLAN][API] {plan['cls_name']} operator-mask "
                    f"bbox={u_ext:.2f}×{v_ext:.2f}m n={n_wp}"
                )
                state, state_tick = "PAINT", 0
                continue

            if not wants_paint:
                plan = None
                continue
            u_ext, v_ext = plan["bbox"]
            n_wp = len(plan["waypoints"])
            print(
                f"[painter][PLAN] {plan['cls_name']} anchor={np.round(plan['anchor_point_base'], 3).tolist()} "
                f"normal={np.round(plan['anchor_normal_base'], 3).tolist()} "
                f"bbox={u_ext:.2f}×{v_ext:.2f}m n={n_wp}"
            )
            if plan["conf"] < PAINT_CONFIDENCE_MIN:
                print(f"[painter][IDLE] conf {plan['conf']:.2f} < min — skip")
                plan = None
                continue
            plan["paint_idx"] = 0
            plan["paint_waypoint_tick"] = 0
            state, state_tick = "PAINT", 0
            continue

        if state == "PAINT":
            n_wp = len(plan["waypoints"])
            if n_wp <= 0:
                plan = None
                state, state_tick = "IDLE", 0
                continue
            # Process multiple waypoints per tick to make the spray pass faster.
            for _ in range(WAYPOINTS_PER_TICK):
                idx = plan["paint_idx"]
                wp_tick = plan["paint_waypoint_tick"]
                if wp_tick == 0:
                    _tp, tool_z, surface_pt = plan["waypoints"][idx]
                    surface_normal = -np.asarray(tool_z, dtype=np.float64)
                    deposit_spray_stamp(
                        robot,
                        ctx["base_node"],
                        surface_pt,
                        surface_normal,
                        paint_state,
                        rng,
                    )
                    if idx % 25 == 0 or idx == n_wp - 1:
                        print(
                            f"[painter][PAINT] {idx + 1}/{n_wp} "
                            f"surface@base={np.round(surface_pt, 3).tolist()}"
                        )
                plan["paint_waypoint_tick"] = wp_tick + 1
                if plan["paint_waypoint_tick"] >= PAINT_TICKS_PER_WAYPOINT:
                    plan["paint_waypoint_tick"] = 0
                    plan["paint_idx"] = idx + 1
                    if plan["paint_idx"] >= n_wp:
                        print(f"[painter][PAINT] done {n_wp} pose(s) → IDLE")
                        plan = None
                        state, state_tick = "IDLE", 0
                        break


if __name__ == "__main__":
    main()
