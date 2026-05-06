import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useOperator } from "../context/OperatorContext";

export function Team() {
  const {
    operators,
    activeOperator,
    selectOperator,
    registerOperator,
    deleteOperator
  } = useOperator();

  const location = useLocation();
  const from = location.state?.from;

  const [displayName, setDisplayName] = useState("");
  const [badgeId, setBadgeId] = useState("");
  const [formError, setFormError] = useState("");

  function onSubmit(e) {
    e.preventDefault();
    setFormError("");
    const res = registerOperator({ displayName, badgeId });
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    selectOperator(res.operator.id);
    setDisplayName("");
    setBadgeId("");
  }

  return (
    <div className="page fade-in">
      <header className="page__hero">
        <h1 className="page__title">Team</h1>
        <p className="page__lede">
          Operators are registered here — not typed ad hoc. Each profile gets a stable
          id used for sessions, mask approvals, and paint jobs.
        </p>
      </header>

      {from && !activeOperator && (
        <div className="banner banner--warn">
          <p>Sign in to access {from}.</p>
        </div>
      )}

      <section className="panel">
        <h2 className="panel__title">Signed in</h2>
        {activeOperator ? (
          <dl className="kv">
            <div>
              <dt>Name</dt>
              <dd>{activeOperator.displayName}</dd>
            </div>
            <div>
              <dt>Badge</dt>
              <dd className="mono">{activeOperator.badgeId}</dd>
            </div>
            <div>
              <dt>Operator id</dt>
              <dd className="mono">{activeOperator.id}</dd>
            </div>
          </dl>
        ) : (
          <p className="panel__muted">No operator selected.</p>
        )}
      </section>

      <section className="panel">
        <h2 className="panel__title">Register operator</h2>
        <form className="form" onSubmit={onSubmit}>
          {formError && (
            <div className="banner banner--error banner--compact">
              <p>{formError}</p>
            </div>
          )}
          <label className="field">
            <span className="field__label">Display name</span>
            <input
              className="field__input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          </label>
          <label className="field">
            <span className="field__label">Badge number</span>
            <input
              className="field__input mono"
              value={badgeId}
              onChange={(e) => setBadgeId(e.target.value.toUpperCase())}
              placeholder="e.g. A1842"
              required
              autoComplete="off"
            />
            <span className="field__hint">4–12 letters or digits. Must be unique.</span>
          </label>
          <button type="submit" className="btn">
            Create &amp; sign in
          </button>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel__title">Directory</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Badge</th>
                <th>Id</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr key={op.id}>
                  <td>{op.displayName}</td>
                  <td className="mono">{op.badgeId}</td>
                  <td className="mono">{op.id}</td>
                  <td className="table__actions">
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => selectOperator(op.id)}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => {
                        if (confirm(`Remove ${op.displayName} from this workstation?`)) {
                          deleteOperator(op.id);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!operators.length && (
            <p className="panel__muted table__empty">No operators yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
