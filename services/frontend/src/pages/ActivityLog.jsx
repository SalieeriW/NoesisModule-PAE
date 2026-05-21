import { useCallback, useEffect, useState } from "react";
import { listSessions, listRecentMaskRevisions, maskAssetHref } from "../lib/api";
import { useWorkbench } from "../context/WorkbenchContext";

function formatTime(ts) {
  if (ts == null) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(ts));
  } catch { return String(ts); }
}

const TONE = { session: "session", capture: "capture", detection: "detection", mask: "mask", paint: "paint" };

export function ActivityLog() {
  const { milestones } = useWorkbench();
  const [sessions, setSessions] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, a] = await Promise.all([listSessions(20), listRecentMaskRevisions(20)]);
      setSessions(s);
      setApprovals(a);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="page fade-in">
      <div className="page__hero page__hero--row">
        <div>
          <h1 className="page__title">Operations</h1>
          <p className="page__lede">Shift log and session history.</p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={refresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div className="banner banner--error banner--compact"><p>{error}</p></div>}

      {/* Shift timeline */}
      <section className="panel">
        <h2 className="panel__title">This shift</h2>
        <ul className="timeline">
          {milestones.length === 0 && (
            <li className="timeline__empty">No activity yet — start a session in Process.</li>
          )}
          {milestones.map((m) => (
            <li key={m.id} className={`timeline__item timeline__item--${TONE[m.kind] || "neutral"}`}>
              <div className="timeline__dot" aria-hidden />
              <div className="timeline__body">
                <p className="timeline__title">{m.title}</p>
                <p className="timeline__detail">{m.detail}</p>
                <time className="timeline__time mono">{formatTime(m.ts)}</time>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Sessions */}
      <section className="panel">
        <h2 className="panel__title">Recent sessions</h2>
        <ul className="ops-list">
          {sessions.length === 0 && !loading && (
            <li className="panel__muted">No sessions yet.</li>
          )}
          {sessions.map((s) => (
            <li key={s.id} className="ops-row">
              <span className={`sess-pill sess-pill--${s.status}`}>{s.status}</span>
              <span className="ops-row__id mono">#{s.id}</span>
              <span className="ops-row__vin mono">{s.vin}</span>
              <span className="ops-row__op mono">{s.operator_id}</span>
              <time className="ops-row__time">{formatTime(s.started_at)}</time>
            </li>
          ))}
        </ul>
      </section>

      {/* Mask approvals */}
      {approvals.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">Mask approvals</h2>
          <ul className="ops-list">
            {approvals.map((row) => (
              <li key={row.id} className="ops-row ops-row--mask">
                <span className="chip chip--ok">Rev #{row.revision_no}</span>
                <span className="ops-row__part mono">{row.part_class || "—"}</span>
                <span className="ops-row__op mono">{row.author_id || "—"}</span>
                {row.mask_uri ? (
                  <a className="ops-row__link" href={maskAssetHref(row.mask_uri)} target="_blank" rel="noreferrer">
                    View mask
                  </a>
                ) : (
                  <span className="ops-row__time">—</span>
                )}
                <time className="ops-row__time">{formatTime(row.created_at)}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
