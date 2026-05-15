import { useWorkbench } from "../context/WorkbenchContext";

const PAINT_PALETTE = [
  { label: "White",          hex: "#F5F5F5" },
  { label: "Pearl White",    hex: "#EDE8DC" },
  { label: "Silver",         hex: "#B8B8B8" },
  { label: "Titanium",       hex: "#737373" },
  { label: "Graphite",       hex: "#404040" },
  { label: "Midnight Black", hex: "#141414" },
  { label: "Racing Red",     hex: "#CC1414" },
  { label: "Deep Red",       hex: "#8C1C1C" },
  { label: "Bordeaux",       hex: "#6B1A2E" },
  { label: "Cobalt Blue",    hex: "#1E3F88" },
  { label: "Midnight Blue",  hex: "#1C2B4A" },
  { label: "Sky Blue",       hex: "#4A90C4" },
  { label: "British Green",  hex: "#003D26" },
  { label: "Olive",          hex: "#4A5E2E" },
  { label: "Orange",         hex: "#D45A14" },
  { label: "Yellow",         hex: "#E8C020" },
  { label: "Champagne",      hex: "#C8B090" },
  { label: "Bronze",         hex: "#8C6A3C" },
];

function hexToLabel(hex, palette) {
  const found = palette.find((p) => p.hex.toLowerCase() === hex.toLowerCase());
  return found ? found.label : "Custom";
}

export function Production() {
  const {
    session,
    detection,
    revision,
    paintJob,
    paintColor,
    setPaintColor,
    createAndExecuteJob,
    cancelJob,
    busy,
    operatorStatus,
    paintProgress,
    flowError
  } = useWorkbench();

  const barPercent =
    operatorStatus?.sim_state === "PAINT" &&
    operatorStatus?.paint &&
    typeof operatorStatus.paint.percent === "number"
      ? operatorStatus.paint.percent
      : paintProgress;

  const ready = !!(session && detection && revision);
  const colorLabel = hexToLabel(paintColor, PAINT_PALETTE);

  return (
    <div className="page fade-in">
      <header className="page__hero">
        <h1 className="page__title">Production</h1>
        <p className="page__lede">
          Configure paint parameters, dispatch the job to the controller, and monitor
          progress in real time.
        </p>
      </header>

      {flowError && (
        <div className="banner banner--error">
          <p>{flowError}</p>
        </div>
      )}

      <section className="panel">
        <h2 className="panel__title">Prerequisites</h2>
        <ul className="checklist">
          <li className={session ? "ok" : ""}>Active session</li>
          <li className={detection ? "ok" : ""}>Detection locked</li>
          <li className={revision ? "ok" : ""}>Approved mask revision</li>
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel__title">Paint colour</h2>

        <div className="color-palette">
          {PAINT_PALETTE.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              className={`color-swatch${paintColor.toLowerCase() === swatch.hex.toLowerCase() ? " color-swatch--selected" : ""}`}
              style={{ "--swatch-color": swatch.hex }}
              title={swatch.label}
              aria-label={swatch.label}
              aria-pressed={paintColor.toLowerCase() === swatch.hex.toLowerCase()}
              onClick={() => setPaintColor(swatch.hex)}
            />
          ))}
        </div>

        <div className="color-custom-row">
          <label className="color-custom-label">
            Custom
            <input
              type="color"
              className="color-custom-input"
              value={paintColor}
              onChange={(e) => setPaintColor(e.target.value)}
            />
          </label>
          <div className="color-preview" style={{ "--swatch-color": paintColor }}>
            <span className="color-preview__label">{colorLabel}</span>
            <span className="color-preview__hex mono">{paintColor.toUpperCase()}</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Execute</h2>
        <div className="job-summary">
          <div className="job-summary__swatch" style={{ "--swatch-color": paintColor }} />
          <span>
            <strong>{colorLabel}</strong>
            {detection ? ` · ${detection.part_class}` : ""}
          </span>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn"
            disabled={busy || !ready}
            onClick={() => createAndExecuteJob()}
          >
            Execute paint job
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy || !paintJob}
            onClick={() => cancelJob()}
          >
            Cancel job
          </button>
        </div>
        <p className="help mono">Status: {paintJob?.status ?? "idle"}</p>
        <div className="progress" role="progressbar" aria-valuenow={barPercent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress__fill" style={{ width: `${barPercent}%` }} />
        </div>
        <p className="help">
          Progress {barPercent}%
          {operatorStatus?.sim_state === "PAINT" ? " · Webots PAINT" : " · API / idle"}
        </p>
      </section>
    </div>
  );
}
