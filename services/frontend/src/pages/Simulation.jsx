import { useEffect, useState } from "react";
import { simLatestViewUrl } from "../lib/api";
import { useWorkbench } from "../context/WorkbenchContext";

/** ~12 FPS; avoids MJPEG multipart + chunked proxy issues (black frame, no img onError). */
const VIEWPORT_POLL_MS = 80;

export function Simulation() {
  const {
    detection,
    capture,
    runtimeStatus,
    operatorStatus,
    startRuntime,
    stopRuntime,
    busy
  } = useWorkbench();

  const [frameTick, setFrameTick] = useState(0);
  const [frameBroken, setFrameBroken] = useState(false);

  useEffect(() => {
    if (runtimeStatus !== "running") return undefined;
    setFrameBroken(false);
    const id = setInterval(() => setFrameTick((n) => n + 1), VIEWPORT_POLL_MS);
    return () => clearInterval(id);
  }, [runtimeStatus]);

  const viewportSrc =
    runtimeStatus === "running"
      ? `${simLatestViewUrl()}?t=${frameTick}`
      : `${simLatestViewUrl()}?idle=1`;
  const rgbAge = operatorStatus?.rgb_age_seconds;
  const feedLive =
    typeof rgbAge === "number" && rgbAge >= 0 && rgbAge < 1.8;

  return (
    <div className="page fade-in">
      <header className="page__hero">
        <h1 className="page__title">Simulation</h1>
        <p className="page__lede">
          View-only stream from the workcell. Runtime toggles talk to the sim service;
          keep Webots in Play for a live feed.
        </p>
      </header>

      <div className="banner banner--compact">
        <p>
          <strong>Why the HUD mask looks different from the car:</strong> the small
          thumbnail is the <em>2D YOLO mask</em> in camera space. The grey treatment on the
          3D body is <em>spray simulation</em> (points in the world). Compare apples to
          apples on <strong>Mask approval</strong> using the capture frame under the mask.
        </p>
      </div>

      <div className="viewport">
        <img
          key={runtimeStatus === "running" ? "live" : "idle"}
          src={viewportSrc}
          alt="Webots viewport"
          className="viewport__img"
          onLoad={() => setFrameBroken(false)}
          onError={() => setFrameBroken(true)}
        />
        <div className="viewport__hud">
          <p className="viewport__hud-title">
            {detection?.part_class || "No part selected"}
          </p>
          <p className="viewport__hud-meta">
            {runtimeStatus === "running" ? "Live snapshots · read-only" : "Last frame · read-only"}
          </p>
          {typeof rgbAge === "number" && (
            <p className="mono viewport__hud-meta">Δt {rgbAge.toFixed(2)}s</p>
          )}
              {detection?.raw_mask_uri && capture?.frame_uri && (
                <div className="viewport__thumb-stack" aria-hidden>
                  <img
                    src={capture.frame_uri}
                    alt=""
                    className="viewport__thumb-bg"
                  />
                  <div
                    className="viewport__thumb-mask-overlay"
                    style={{
                      WebkitMaskImage: `url(${JSON.stringify(detection.raw_mask_uri)})`,
                      maskImage: `url(${JSON.stringify(detection.raw_mask_uri)})`
                    }}
                  />
                </div>
              )}
              {detection?.raw_mask_uri && !capture?.frame_uri && (
                <img
                  src={detection.raw_mask_uri}
                  alt=""
                  className="viewport__thumb"
                />
              )}
        </div>
      </div>

      <div className="page__actions">
        <button
          type="button"
          className="btn"
          disabled={busy || runtimeStatus === "running"}
          onClick={() => startRuntime()}
        >
          Start runtime
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy || runtimeStatus !== "running"}
          onClick={() => stopRuntime()}
        >
          Stop runtime
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={runtimeStatus !== "running"}
          onClick={() => {
            setFrameTick((n) => n + 1);
            setFrameBroken(false);
          }}
        >
          Refresh viewport
        </button>
      </div>

      {frameBroken && (
        <p className="help help--warn">
          Viewport image failed to load (404 usually means <span className="mono">rgb.npy</span> is
          missing). Run Webots with <span className="mono">--viewport-camera-feed</span>, press
          Play, and confirm the sim-service can read{" "}
          <span className="mono">controllers/painter_controller/viewport_cache/</span>.
        </p>
      )}

      {!feedLive && runtimeStatus === "running" && (
        <p className="help help--warn">
          Feed is stale — confirm Webots is playing and the viewport-feed controller is
          writing <span className="mono">rgb.npy</span>.
        </p>
      )}
    </div>
  );
}
