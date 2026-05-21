import { useEffect, useState } from "react";
import { simLatestViewUrl } from "../lib/api";
import { useWorkbench } from "../context/WorkbenchContext";

const POLL_MS = 80;

export function Simulation() {
  const { detection, capture, runtimeStatus, operatorStatus, startRuntime, stopRuntime, busy } = useWorkbench();
  const [tick, setTick] = useState(0);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (runtimeStatus !== "running") return;
    setBroken(false);
    const id = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => clearInterval(id);
  }, [runtimeStatus]);

  const src = `${simLatestViewUrl()}?t=${tick}`;
  const rgbAge = operatorStatus?.rgb_age_seconds;
  const live = typeof rgbAge === "number" && rgbAge >= 0 && rgbAge < 1.8;
  const running = runtimeStatus === "running";

  return (
    <div className="page fade-in">
      <div className="sim-header">
        <div>
          <h1 className="page__title">Simulation</h1>
          <p className="page__lede">Live workcell viewport.</p>
        </div>
        <div className="chip-row">
          {running ? (
            <span className={`chip ${live ? "chip--ok" : "chip--warn"}`}>
              {live ? "● Live" : "○ Stale feed"}
            </span>
          ) : (
            <span className="chip chip--neutral">● Stopped</span>
          )}
          {typeof rgbAge === "number" && (
            <span className="chip chip--neutral mono">Δt {rgbAge.toFixed(2)}s</span>
          )}
        </div>
      </div>

      <div className="sim-controls">
        <button className="btn" disabled={busy || running} onClick={() => startRuntime()}>
          Start runtime
        </button>
        <button className="btn btn--ghost" disabled={busy || !running} onClick={() => stopRuntime()}>
          Stop runtime
        </button>
        <button
          className="btn btn--ghost"
          disabled={!running}
          onClick={() => { setTick((n) => n + 1); setBroken(false); }}
        >
          Refresh
        </button>
      </div>

      <div className="viewport">
        <img
          key={running ? "live" : "idle"}
          src={src}
          alt="Webots viewport"
          className="viewport__img"
          onLoad={() => setBroken(false)}
          onError={() => setBroken(true)}
        />
        <div className="viewport__hud">
          <p className="viewport__hud-title">
            {detection?.part_class?.replace(/_/g, " ") || "No part selected"}
          </p>
          <p className="viewport__hud-meta">
            {running ? "Live snapshots · read-only" : "Last frame · read-only"}
          </p>
          {detection?.raw_mask_uri && capture?.frame_uri && (
            <div className="viewport__thumb-stack" aria-hidden>
              <img src={capture.frame_uri} alt="" className="viewport__thumb-bg" />
              <div
                className="viewport__thumb-mask-overlay"
                style={{
                  WebkitMaskImage: `url(${JSON.stringify(detection.raw_mask_uri)})`,
                  maskImage: `url(${JSON.stringify(detection.raw_mask_uri)})`,
                }}
              />
            </div>
          )}
          {detection?.raw_mask_uri && !capture?.frame_uri && (
            <img src={detection.raw_mask_uri} alt="" className="viewport__thumb" />
          )}
        </div>
      </div>

      {broken && (
        <p className="help help--warn">
          Viewport failed to load — is Webots running with viewport feed enabled?
        </p>
      )}
      {!live && running && !broken && (
        <p className="help help--warn">
          Feed appears stale — confirm Webots is in Play mode.
        </p>
      )}
    </div>
  );
}
