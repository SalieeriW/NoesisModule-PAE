import { useWorkbench } from "../context/WorkbenchContext";

export function Production() {
  const {
    session,
    detection,
    revision,
    paintJob,
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

  return (
    <div className="page fade-in">
      <header className="page__hero">
        <h1 className="page__title">Production</h1>
        <p className="page__lede">
          Dispatch a single paint job to the controller handshake. Progress merges API
          events with Webots operator status when available.
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
        <h2 className="panel__title">Execute</h2>
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
