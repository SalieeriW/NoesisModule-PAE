import { useEffect, useRef, useState } from "react";
import { fetchAsBlob, simLatestViewUrl } from "../lib/api";
import { useWorkbench } from "../context/WorkbenchContext";

const POLL_MS = 800;

export function MiniViewport({ showControls = true }) {
  const { runtimeStatus, operatorStatus } = useWorkbench();
  const [imgSrc, setImgSrc] = useState(null);
  const [broken, setBroken] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const blobRef = useRef(null);

  const running = runtimeStatus === "running";
  const rgbAge = operatorStatus?.rgb_age_seconds;
  const live = typeof rgbAge === "number" && rgbAge >= 0 && rgbAge < 1.8;

  useEffect(() => {
    setBroken(false);

    const prev = blobRef.current;
    if (prev) { URL.revokeObjectURL(prev); blobRef.current = null; }
    setImgSrc(null);

    if (!running) return;

    let cancelled = false;

    const fetchFrame = async () => {
      try {
        const blobUrl = await fetchAsBlob(`${simLatestViewUrl()}?t=${Date.now()}`);
        if (cancelled) { URL.revokeObjectURL(blobUrl); return; }
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        blobRef.current = blobUrl;
        setImgSrc(blobUrl);
        setBroken(false);
      } catch {
        if (!cancelled) setBroken(true);
      }
    };

    fetchFrame();
    const id = setInterval(fetchFrame, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
      if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
    };
  }, [running, refreshKey]);

  const showSkeleton = !imgSrc || broken || !running;

  return (
    <div className="mini-vp">
      <div className="mini-vp__frame">
        {imgSrc && (
          <img
            src={imgSrc}
            alt="Workcell viewport"
            className="mini-vp__img"
            style={{ opacity: showSkeleton ? 0 : 1 }}
          />
        )}

        {showSkeleton && (
          <div className="mini-vp__skeleton">
            <div className="mini-vp__skeleton-icon">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect x="4" y="8" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                <circle cx="13" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                <path d="M4 24 L11 17 L17 22 L22 16 L32 24" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.4"/>
              </svg>
            </div>
            <p className="mini-vp__skeleton-label">
              {running ? "Connecting…" : "Webots stopped"}
            </p>
          </div>
        )}

        <div className="mini-vp__badge">
          <span className={`chip ${running && live ? "chip--ok" : running ? "chip--warn" : "chip--neutral"}`}>
            {running && live ? "● Live" : running ? "Stale" : "Stopped"}
          </span>
          {typeof rgbAge === "number" && (
            <span className="chip chip--neutral mono">Δt {rgbAge.toFixed(1)}s</span>
          )}
        </div>

        {showControls && (
          <button
            className="mini-vp__refresh"
            title="Refresh"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            ↺
          </button>
        )}
      </div>
    </div>
  );
}
