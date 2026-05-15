from __future__ import annotations

import io
import time
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

TARGET_CLASSES = {
    "front_door", "back_door", "hood", "trunk",
    "front_fender", "rear_fender", "bumper", "roof",
}
YOLO_CONFIDENCE = 0.10


class PerceptionService:
    def __init__(self) -> None:
        self._model = None
        self._device: str = "cpu"

    def load_model(self, weights_path: str, device: str = "cpu") -> None:
        try:
            from ultralytics import YOLO
            p = Path(weights_path)
            if not p.is_file():
                import sys
                print(
                    f"[perception] {weights_path!r} not found, falling back to yolov8n-seg.pt",
                    file=sys.stderr,
                )
                p = Path("yolov8n-seg.pt")
            self._model = YOLO(str(p))
            self._device = device
        except Exception as exc:
            import sys
            print(f"[perception] YOLO load failed: {exc}", file=sys.stderr)

    def run_detection(self, jpeg_bytes: bytes, mask_export_dir: Path) -> list[dict]:
        if self._model is None or not jpeg_bytes:
            return []
        try:
            img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
            arr = np.array(img)
        except Exception:
            return []
        try:
            results = self._model.predict(
                arr, device=self._device, conf=YOLO_CONFIDENCE, verbose=False
            )
        except Exception:
            return []

        mask_export_dir.mkdir(parents=True, exist_ok=True)
        detections: list[dict] = []
        for result in results:
            if result.boxes is None:
                continue
            h, w = arr.shape[:2]
            classes = result.names
            masks = result.masks
            for i, box in enumerate(result.boxes):
                cls_id = int(box.cls[0])
                cls_name = classes.get(cls_id, str(cls_id)).lower().replace(" ", "_")
                if cls_name not in TARGET_CLASSES:
                    continue
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                mask_uri: Optional[str] = None
                if masks is not None and i < len(masks.data):
                    mask_arr = masks.data[i].cpu().numpy()
                    mask_img = Image.fromarray(
                        (mask_arr * 255).astype(np.uint8), mode="L"
                    ).resize((w, h), Image.NEAREST)
                    fname = f"{cls_name}_{int(time.time())}_{i}.png"
                    buf = io.BytesIO()
                    mask_img.save(buf, format="PNG")
                    (mask_export_dir / fname).write_bytes(buf.getvalue())
                    mask_uri = f"sim/runtime/masks/{fname}"
                detections.append({
                    "part_class": cls_name,
                    "confidence": round(conf, 4),
                    "bbox": {
                        "x": round(x1), "y": round(y1),
                        "w": round(x2 - x1), "h": round(y2 - y1),
                    },
                    "raw_mask_uri": mask_uri,
                })
        return detections


perception_service = PerceptionService()
