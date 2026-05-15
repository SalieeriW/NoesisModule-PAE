import { Link } from "react-router-dom";
import { useOperator } from "../context/OperatorContext";
import { useWorkbench } from "../context/WorkbenchContext";

const cards = [
  {
    to: "/simulation",
    title: "Simulation",
    text: "Start/stop runtime and monitor the live Webots viewport."
  },
  {
    to: "/inspection",
    title: "Inspection",
    text: "Open a session, capture a frame, and lock part detections."
  },
  {
    to: "/mask",
    title: "Mask approval",
    text: "Record an approved mask revision before production."
  },
  {
    to: "/production",
    title: "Production",
    text: "Configure paint colour and execute the job."
  }
];

export function Overview() {
  const { activeOperator } = useOperator();
  const {
    session,
    detection,
    revision,
    paintJob,
    paintColor,
    endSession,
    busy,
    flowError,
    operatorStatus
  } = useWorkbench();

  return (
    <div className="page fade-in">
      <header className="page__hero">
        <h1 className="page__title">Shift overview</h1>
        <p className="page__lede">
          Structured workflow for a single workcell — separate concerns, auditable steps,
          no improvised operator ids.
        </p>
      </header>

      {!activeOperator && (
        <div className="banner banner--warn">
          <p>
            <strong>Sign in required.</strong> Add or select an operator under{" "}
            <Link to="/team">Team</Link> before running inspection or production.
          </p>
        </div>
      )}

      {flowError && (
        <div className="banner banner--error">
          <p>{flowError}</p>
        </div>
      )}

      <section className="panel">
        <h2 className="panel__title">Current job</h2>
        <dl className="kv">
          <div>
            <dt>Session</dt>
            <dd>{session ? `#${session.id} · active` : "—"}</dd>
          </div>
          <div>
            <dt>Part</dt>
            <dd>{detection?.part_class ?? "—"}</dd>
          </div>
          <div>
            <dt>Mask revision</dt>
            <dd>{revision ? `#${revision.id} approved` : "—"}</dd>
          </div>
          <div>
            <dt>Paint colour</dt>
            <dd>
              <span className="color-dot" style={{ "--swatch-color": paintColor }} />
              {paintColor.toUpperCase()}
            </dd>
          </div>
          <div>
            <dt>Paint job</dt>
            <dd>{paintJob ? `#${paintJob.id} · ${paintJob.status}` : "—"}</dd>
          </div>
          <div>
            <dt>Webots</dt>
            <dd className="mono">
              {operatorStatus?.sim_state ?? "—"}
              {operatorStatus?.perception_source
                ? ` · ${operatorStatus.perception_source}`
                : ""}
            </dd>
          </div>
        </dl>
        {session && (
          <div className="page__actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => endSession()}
            >
              Close session
            </button>
          </div>
        )}
      </section>

      <section className="grid-cards">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="tile">
            <h3 className="tile__title">{c.title}</h3>
            <p className="tile__text">{c.text}</p>
            <span className="tile__cta">Open →</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
