import { useCallback, useEffect, useRef, useState } from "react";
import { maskDisplayUrl, uploadMaskPng } from "../lib/api";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    im.src = src;
  });
}

/**
 * Interactive mask over the inspection frame (same pixels as YOLO).
 * Export uploads PNG to sim-service for mask_uri on approval.
 */
export function MaskOverlayEditor({
  frameUrl,
  maskUrl,
  onMaskUri,
  onBrushDirtyChange,
  disabled,
  busy
}) {
  const canvasRef = useRef(null);
  const maskStateRef = useRef(null);
  const [brushMode, setBrushMode] = useState("add");
  const [brushSize, setBrushSize] = useState(16);
  const [overlayAlpha, setOverlayAlpha] = useState(0.45);
  const overlayAlphaRef = useRef(overlayAlpha);
  const [editorMsg, setEditorMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const drawing = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    overlayAlphaRef.current = overlayAlpha;
  }, [overlayAlpha]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const st = maskStateRef.current;
    if (!canvas || !st?.frameIm || !st.buf) return;
    const { frameIm, buf, nw, nh } = st;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, nw, nh);
    ctx.drawImage(frameIm, 0, 0, nw, nh);

    // Tint only mask pixels: alpha = 0 outside mask, accent RGB inside (not
    // destination-in + opaque mask canvas — that kept the full orange rect).
    const ocv = document.createElement("canvas");
    ocv.width = nw;
    ocv.height = nh;
    const octx = ocv.getContext("2d");
    const imgd = octx.createImageData(nw, nh);
    const aByte = Math.round(overlayAlphaRef.current * 255);
    for (let i = 0; i < buf.length; i++) {
      const j = i * 4;
      const m = buf[i];
      imgd.data[j] = 196;
      imgd.data[j + 1] = 92;
      imgd.data[j + 2] = 38;
      // Follow mask strength exactly (0–255), not a hard threshold.
      imgd.data[j + 3] = Math.round((m / 255) * aByte);
    }
    octx.putImageData(imgd, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(ocv, 0, 0);
    ctx.restore();
  }, []);

  useEffect(() => {
    if (!frameUrl || !maskUrl) {
      maskStateRef.current = null;
      return;
    }
    let cancelled = false;
    setEditorMsg("Loading frame + mask…");
    (async () => {
      try {
        const [frameIm, maskIm] = await Promise.all([
          loadImage(frameUrl),
          loadImage(maskUrl)
        ]);
        if (cancelled) return;
        const nw = frameIm.naturalWidth;
        const nh = frameIm.naturalHeight;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = nw;
          canvas.height = nh;
        }
        const tmp = document.createElement("canvas");
        tmp.width = nw;
        tmp.height = nh;
        const tctx = tmp.getContext("2d");
        // Segmentation masks must not be bilinear-resampled: blurred fringes fall
        // below the luminance threshold and look like missing / jagged edges.
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(maskIm, 0, 0, nw, nh);
        const md = tctx.getImageData(0, 0, nw, nh);
        const buf = new Uint8Array(nw * nh);
        for (let i = 0; i < buf.length; i++) {
          const j = i * 4;
          const r = md.data[j];
          const g = md.data[j + 1];
          const b = md.data[j + 2];
          const a = md.data[j + 3];
          const lum = (r + g + b) / 3;
          const lm = Math.min(255, Math.max(0, Math.round(lum)));
          let m;
          if (a <= 0) {
            m = 0;
          } else if (a >= 250) {
            // Opaque label mask: follow grayscale value exactly (0–255).
            m = lm;
          } else if (lm < 4) {
            // Transparent PNG, shape defined mostly by alpha (e.g. cut-out).
            m = Math.min(255, Math.round(a));
          } else {
            m = Math.min(255, Math.round((lm * a) / 255));
          }
          buf[i] = m;
        }
        maskStateRef.current = { buf, frameIm, nw, nh };
        redraw();
        setEditorMsg("");
        onBrushDirtyChange?.(false);
      } catch (e) {
        if (!cancelled) setEditorMsg(String(e?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frameUrl, maskUrl, reloadKey, redraw, onBrushDirtyChange]);

  useEffect(() => {
    redraw();
  }, [redraw, overlayAlpha]);

  const paintAt = useCallback(
    (cx, cy) => {
      const st = maskStateRef.current;
      if (!st) return;
      const { buf, nw, nh } = st;
      const r = brushSize;
      const v = brushMode === "add" ? 255 : 0;
      const x0 = Math.max(0, Math.floor(cx));
      const y0 = Math.max(0, Math.floor(cy));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const x = x0 + dx;
          const y = y0 + dy;
          if (x < 0 || y < 0 || x >= nw || y >= nh) continue;
          buf[y * nw + x] = v;
        }
      }
      redraw();
      onBrushDirtyChange?.(true);
    },
    [brushMode, brushSize, redraw, onBrushDirtyChange]
  );

  const onPointerDown = (e) => {
    const st = maskStateRef.current;
    if (disabled || !st || !canvasRef.current) return;
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { nw, nh } = st;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = nw / rect.width;
    const sy = nh / rect.height;
    paintAt((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
  };

  const onPointerMove = (e) => {
    if (!drawing.current || disabled) return;
    const st = maskStateRef.current;
    if (!st || !canvasRef.current) return;
    const { nw, nh } = st;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = nw / rect.width;
    const sy = nh / rect.height;
    paintAt((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
  };

  const endStroke = () => {
    drawing.current = false;
  };

  const resetFromYolo = () => {
    setReloadKey((k) => k + 1);
  };

  const saveEditedMask = async () => {
    const st = maskStateRef.current;
    if (!st) return;
    const { buf, nw, nh } = st;
    setUploading(true);
    setEditorMsg("");
    try {
      const c = document.createElement("canvas");
      c.width = nw;
      c.height = nh;
      const ctx = c.getContext("2d");
      const imgd = ctx.createImageData(nw, nh);
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        const j = i * 4;
        imgd.data[j] = v;
        imgd.data[j + 1] = v;
        imgd.data[j + 2] = v;
        imgd.data[j + 3] = 255;
      }
      ctx.putImageData(imgd, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, "image/png"));
      if (!blob) throw new Error("Could not encode PNG");
      const json = await uploadMaskPng(blob);
      onMaskUri(maskDisplayUrl(json.mask_uri));
      onBrushDirtyChange?.(false);
      setEditorMsg("Saved edited mask — URI updated for approval.");
    } catch (err) {
      setEditorMsg(String(err?.message || err));
    } finally {
      setUploading(false);
    }
  };

  if (!frameUrl || !maskUrl) {
    return (
      <p className="help">Run inspection first to attach a frame and mask.</p>
    );
  }

  return (
    <div className="mask-editor">
      <div className="mask-editor__toolbar">
        <label className="mask-editor__control">
          <span>Overlay</span>
          <input
            type="range"
            min={0.15}
            max={0.85}
            step={0.05}
            value={overlayAlpha}
            onChange={(e) => setOverlayAlpha(Number(e.target.value))}
            disabled={disabled}
          />
        </label>
        <div className="mask-editor__modes">
          <button
            type="button"
            className={`btn btn--sm ${brushMode === "add" ? "" : "btn--ghost"}`}
            onClick={() => setBrushMode("add")}
            disabled={disabled}
          >
            Add
          </button>
          <button
            type="button"
            className={`btn btn--sm ${brushMode === "erase" ? "" : "btn--ghost"}`}
            onClick={() => setBrushMode("erase")}
            disabled={disabled}
          >
            Erase
          </button>
        </div>
        <label className="mask-editor__control">
          <span>Brush</span>
          <input
            type="range"
            min={4}
            max={48}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            disabled={disabled}
          />
        </label>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={resetFromYolo}
          disabled={disabled || busy}
        >
          Reset from YOLO
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={saveEditedMask}
          disabled={disabled || busy || uploading}
        >
          {uploading ? "Uploading…" : "Use edited mask"}
        </button>
      </div>

      <div className="mask-editor__canvas-wrap">
        <canvas
          ref={canvasRef}
          className="mask-editor__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
      </div>
      {editorMsg && <p className="help mask-editor__msg">{editorMsg}</p>}
    </div>
  );
}
