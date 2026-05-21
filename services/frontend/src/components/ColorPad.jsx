import { useCallback, useEffect, useRef, useState } from "react";

/* ── Color math ────────────────────────────────────────────────── */

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), s, v];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex) {
  if (!hex || hex.length < 7) return [255, 255, 255];
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function hsvToHex(h, s, v) {
  return rgbToHex(...hsvToRgb(h, s, v));
}

/* ── SV pad canvas ─────────────────────────────────────────────── */

function drawSvPad(canvas, hue) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const hueRgb = hsvToRgb(hue, 1, 1);
  const hueStr = `rgb(${hueRgb.join(",")})`;

  // Horizontal: white → pure hue
  const gradH = ctx.createLinearGradient(0, 0, w, 0);
  gradH.addColorStop(0, "#fff");
  gradH.addColorStop(1, hueStr);
  ctx.fillStyle = gradH;
  ctx.fillRect(0, 0, w, h);

  // Vertical: transparent → black (multiply)
  const gradV = ctx.createLinearGradient(0, 0, 0, h);
  gradV.addColorStop(0, "rgba(0,0,0,0)");
  gradV.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = gradV;
  ctx.fillRect(0, 0, w, h);
}

function drawHueStrip(canvas) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 6; i++) {
    const rgb = hsvToRgb(i * 60, 1, 1);
    grad.addColorStop(i / 6, `rgb(${rgb.join(",")})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/* ── ColorPad component ────────────────────────────────────────── */

/**
 * Props:
 *   value   — current color as hex string ("#rrggbb")
 *   onChange — called with new hex string
 *   disabled
 */
export function ColorPad({ value = "#ffffff", onChange, disabled }) {
  const svRef   = useRef(null);
  const hueRef  = useRef(null);

  // Parse current hex → HSV
  const initHsv = () => {
    const [r, g, b] = hexToRgb(value);
    return rgbToHsv(r, g, b);
  };
  const [hsv, setHsv] = useState(initHsv);

  // Sync HSV when value changes from outside (AI command)
  useEffect(() => {
    const [r, g, b] = hexToRgb(value);
    const newHsv = rgbToHsv(r, g, b);
    setHsv(newHsv);
  }, [value]);

  const [h, s, v] = hsv;

  // Draw SV pad whenever hue changes
  useEffect(() => {
    if (svRef.current) drawSvPad(svRef.current, h);
  }, [h]);

  // Draw hue strip once
  useEffect(() => {
    if (hueRef.current) drawHueStrip(hueRef.current);
  }, []);

  const pickSv = useCallback((e) => {
    if (disabled) return;
    const canvas = svRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newS = px;
    const newV = 1 - py;
    const newHex = hsvToHex(h, newS, newV);
    setHsv([h, newS, newV]);
    onChange?.(newHex);
  }, [h, disabled, onChange]);

  const pickHue = useCallback((e) => {
    if (disabled) return;
    const canvas = hueRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newH = Math.round(px * 360);
    const newHex = hsvToHex(newH, s, v);
    setHsv([newH, s, v]);
    onChange?.(newHex);
  }, [s, v, disabled, onChange]);

  const svDragging = useRef(false);
  const hueDragging = useRef(false);

  const onSvDown  = (e) => { svDragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pickSv(e); };
  const onSvMove  = (e) => { if (svDragging.current) pickSv(e); };
  const onSvUp    = ()  => { svDragging.current = false; };
  const onHueDown = (e) => { hueDragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pickHue(e); };
  const onHueMove = (e) => { if (hueDragging.current) pickHue(e); };
  const onHueUp   = ()  => { hueDragging.current = false; };

  const hex = hsvToHex(h, s, v);
  // Cursor position as %
  const cursorLeft = `${Math.round(s * 100)}%`;
  const cursorTop  = `${Math.round((1 - v) * 100)}%`;
  const hueLeft    = `${Math.round((h / 360) * 100)}%`;

  return (
    <div className={`color-pad${disabled ? " color-pad--disabled" : ""}`}>
      {/* SV square */}
      <div className="color-pad__sv-wrap">
        <canvas
          ref={svRef}
          className="color-pad__sv"
          width={256}
          height={160}
          onPointerDown={onSvDown}
          onPointerMove={onSvMove}
          onPointerUp={onSvUp}
          onPointerLeave={onSvUp}
          onPointerCancel={onSvUp}
        />
        <div
          className="color-pad__cursor"
          style={{ left: cursorLeft, top: cursorTop }}
        />
      </div>

      {/* Hue strip */}
      <div className="color-pad__hue-wrap">
        <canvas
          ref={hueRef}
          className="color-pad__hue"
          width={256}
          height={16}
          onPointerDown={onHueDown}
          onPointerMove={onHueMove}
          onPointerUp={onHueUp}
          onPointerLeave={onHueUp}
          onPointerCancel={onHueUp}
        />
        <div
          className="color-pad__hue-cursor"
          style={{ left: hueLeft }}
        />
      </div>

      {/* Preview + hex */}
      <div className="color-pad__footer">
        <div className="color-pad__preview" style={{ background: hex }} />
        <span className="color-pad__hex mono">{hex.toUpperCase()}</span>
      </div>
    </div>
  );
}
