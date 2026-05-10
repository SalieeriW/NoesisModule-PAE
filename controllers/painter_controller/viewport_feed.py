"""Minimal Webots controller loop for DEF VIEWPORT_RIG (second Robot process).

Launched as the same ``painter_controller`` Python entrypoint with
``--viewport-camera-feed`` so Webots uses the **same interpreter** as the UR5e
(Supervisor) process (Preferences / full venv path), avoiding a separate
``python`` on PATH lookup that fails for the second robot.

Writes RGB + depth + intrinsics into ``viewport_cache/`` for the arm controller.
"""

from __future__ import annotations

import ctypes
import json
import os
import pathlib

import numpy as np
from controller import Robot


def _atomic_replace(src, dst) -> None:
    import shutil
    try:
        os.replace(src, dst)
    except PermissionError:
        try:
            shutil.copy2(src, dst)
            pathlib.Path(src).unlink(missing_ok=True)
        except OSError:
            pass  # file locked by Docker; drop this frame, next will succeed

CACHE_DIR = pathlib.Path(__file__).resolve().parent / "viewport_cache"
WRITE_EVERY_N_STEPS = 2


def run_viewport_feed() -> None:
    robot = Robot()
    timestep = int(robot.getBasicTimeStep())
    cam = robot.getDevice("viewport_rgb")
    depth = robot.getDevice("viewport_depth")
    if cam is None or depth is None:
        raise RuntimeError("viewport_rgb / viewport_depth devices missing on VIEWPORT_RIG")
    cam.enable(timestep)
    depth.enable(timestep)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    h = cam.getHeight()
    w = cam.getWidth()
    tick = 0
    print("[viewport_feed] running (same controller package as painter); writing cache")
    while robot.step(timestep) != -1:
        tick += 1
        if tick % WRITE_EVERY_N_STEPS != 0:
            continue

        raw = cam.getImage()
        if raw is None:
            continue
        bgra = np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 4)
        rgb = bgra[..., :3][..., ::-1].copy()

        dptr = depth.getRangeImage(data_type="buffer")
        if dptr is None:
            continue
        dep = np.ctypeslib.as_array(
            ctypes.cast(dptr, ctypes.POINTER(ctypes.c_float)),
            shape=(h, w),
        ).astype(np.float32, copy=True)

        meta = {"width": w, "height": h, "fov_h": float(cam.getFov())}
        tmp_rgb = CACHE_DIR / ".tmp_rgb.npy"
        tmp_dep = CACHE_DIR / ".tmp_depth.npy"
        tmp_meta = CACHE_DIR / ".tmp_meta.json"
        fin_rgb = CACHE_DIR / "rgb.npy"
        fin_dep = CACHE_DIR / "depth.npy"
        fin_meta = CACHE_DIR / "meta.json"

        np.save(tmp_rgb, rgb)
        np.save(tmp_dep, dep)
        tmp_meta.write_text(json.dumps(meta), encoding="utf-8")
        _atomic_replace(tmp_rgb, fin_rgb)
        _atomic_replace(tmp_dep, fin_dep)
        _atomic_replace(tmp_meta, fin_meta)
