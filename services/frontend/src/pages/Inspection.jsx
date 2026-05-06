import { useWorkbench } from "../context/WorkbenchContext";
import { vinHint } from "../lib/validation";

export function Inspection() {
  const {
    session,
    vin,
    setVin,
    simDetections,
    selectedDetectionIndex,
    setSelectedDetectionIndex,
    beginFlow,
    applySelectedDetection,
    busy,
    runtimeStatus,
    flowError,
    setFlowError
  } = useWorkbench();

  return (
    <div className="page fade-in">
      <header className="page__hero">
        <h1 className="page__title">Inspection</h1>
        <p className="page__lede">
          Bind a vehicle id, pull a capture from the sim cache, and choose the panel
          YOLO proposal you want to carry forward.
        </p>
      </header>

      {flowError && (
        <div className="banner banner--error">
          <p>{flowError}</p>
        </div>
      )}

      <section className="panel">
        <h2 className="panel__title">Vehicle</h2>
        <div className="form">
          <label className="field">
            <span className="field__label">VIN or demo id</span>
            <input
              className="field__input"
              value={vin}
              onChange={(e) => {
                setFlowError("");
                setVin(e.target.value.toUpperCase());
              }}
              placeholder="e.g. 1HGBH41JXMN109186 or DEMO-LAB01"
              autoComplete="off"
            />
            <span className="field__hint">{vinHint()}</span>
          </label>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Capture &amp; detect</h2>
        <p className="panel__muted">
          Requires runtime live and a signed-in operator (see Team).
        </p>
        <div className="page__actions">
          <button
            type="button"
            className="btn"
            disabled={busy || !!session || runtimeStatus !== "running"}
            onClick={() => beginFlow()}
          >
            Start session + capture + detect
          </button>
        </div>
        <p className="help">
          {session
            ? `Session #${session.id} is open. Close it from Overview when finished.`
            : "No active session."}
        </p>
      </section>

      <section className="panel">
        <h2 className="panel__title">Detected parts</h2>
        <label className="field">
          <span className="field__label">YOLO candidates</span>
          <select
            className="field__input"
            value={selectedDetectionIndex}
            onChange={(e) => setSelectedDetectionIndex(Number(e.target.value))}
            disabled={!simDetections.length || busy}
          >
            {simDetections.map((part, idx) => (
              <option key={`${part.part_class}-${idx}`} value={idx}>
                {part.part_class} · {(part.confidence * 100).toFixed(0)}%
              </option>
            ))}
          </select>
        </label>
        <div className="page__actions">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={!simDetections.length || busy}
            onClick={() => applySelectedDetection()}
          >
            Use selected part
          </button>
        </div>
        {session && !simDetections.length && (
          <p className="help help--warn">
            No parts in cache — adjust the viewport or model classes, then run a new
            session.
          </p>
        )}
      </section>
    </div>
  );
}
