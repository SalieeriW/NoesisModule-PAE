import { useCallback, useEffect, useMemo, useState } from "react";
import { listRecentMaskRevisions, listSessions, maskAssetHref } from "../lib/api";
import { getOperatorById } from "../lib/operatorRegistry";
import { useWorkbench } from "../context/WorkbenchContext";

function formatTime(ts) {
  if (ts == null || ts === "") return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(ts));
  } catch {
    return String(ts);
  }
}

function humanizeSocketEvent(ev) {
  const t = ev?.type || "";
  const p = ev?.payload ?? {};
  switch (t) {
    case "paint.progress":
      return {
        label: "Paint progress",
        detail: `${p.progress_percent ?? "?"}% · job ${p.paint_job_id ?? "—"}`,
        tone: "paint"
      };
    case "paint.completed":
      return {
        label: "Paint completed",
        detail: `Job ${p.paint_job_id ?? "—"} · ${p.status ?? ""}`,
        tone: "paint"
      };
    case "capture.created":
      return {
        label: "Sim capture",
        detail: p.frame_uri || "frame cached",
        tone: "capture"
      };
    case "detection.updated":
      return {
        label: "Detections refreshed",
        detail: `${Array.isArray(p) ? p.length : "?"} parts`,
        tone: "detection"
      };
    case "mask.uploaded":
      return {
        label: "Mask uploaded",
        detail: p.mask_uri || "",
        tone: "mask"
      };
    default:
      return {
        label: t || "Event",
        detail: "",
        tone: "neutral"
      };
  }
}

const milestoneTone = {
  session: "session",
  capture: "capture",
  detection: "detection",
  mask: "mask",
  paint: "paint"
};

export function ActivityLog() {
  const { events, milestones } = useWorkbench();
  const [sessions, setSessions] = useState([]);
  const [sessionsError, setSessionsError] = useState("");
  const [approvals, setApprovals] = useState([]);
  const [approvalsError, setApprovalsError] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);

  const refreshSessions = useCallback(async () => {
    setSessionsError("");
    try {
      const rows = await listSessions(50);
      setSessions(rows);
    } catch (e) {
      setSessionsError(String(e?.message || e));
    }
  }, []);

  const refreshApprovals = useCallback(async () => {
    setApprovalsError("");
    try {
      const rows = await listRecentMaskRevisions(60);
      setApprovals(rows);
    } catch (e) {
      setApprovalsError(String(e?.message || e));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshSessions(), refreshApprovals()]);
  }, [refreshApprovals, refreshSessions]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const socketCards = useMemo(() => {
    return events.slice(0, 25).map((ev, i) => {
      const h = humanizeSocketEvent(ev);
      return { key: `${h.label}-${i}`, ...h, raw: ev };
    });
  }, [events]);

  return (
    <div className="page fade-in">
      <header className="page__hero page__hero--row">
        <div>
          <h1 className="page__title">Operations</h1>
          <p className="page__lede">
            Shift milestones from this workstation, recent sessions from the database, and
            a condensed live channel — not a raw JSON dump.
          </p>
        </div>
        <div className="page__actions" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => refreshAll()}
          >
            Refresh data
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setShowTechnical((v) => !v)}
          >
            {showTechnical ? "Hide technical" : "Technical feed"}
          </button>
        </div>
      </header>

      <section className="panel">
        <h2 className="panel__title">This workstation</h2>
        <p className="panel__muted">
          Steps you completed in this browser (cleared if you wipe site data).
        </p>
        <ul className="timeline">
          {milestones.length === 0 && (
            <li className="timeline__empty">No milestones yet — run inspection or production.</li>
          )}
          {milestones.map((m) => (
            <li key={m.id} className={`timeline__item timeline__item--${milestoneTone[m.kind] || "neutral"}`}>
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

      <section className="panel">
        <h2 className="panel__title">Mask approvals</h2>
        <p className="panel__muted">
          Stored mask revisions with operator id, notes, and traceability to session / VIN.
          Display names appear when that operator is registered on this browser.
        </p>
        {approvalsError && <p className="help help--warn">{approvalsError}</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Approved</th>
                <th>Operator</th>
                <th>Notes</th>
                <th>Part</th>
                <th>Session</th>
                <th>VIN</th>
                <th>Rev</th>
                <th>Mask</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((row) => {
                const op = getOperatorById(row.author_id);
                return (
                  <tr key={row.id}>
                    <td>{formatTime(row.created_at)}</td>
                    <td>
                      {op ? (
                        <>
                          <strong>{op.displayName}</strong>
                          <span className="panel__muted mono"> · {op.badgeId}</span>
                        </>
                      ) : (
                        <span className="mono">{row.author_id || "—"}</span>
                      )}
                    </td>
                    <td className="table__notes" title={row.notes || ""}>
                      {row.notes?.trim() ? row.notes : "—"}
                    </td>
                    <td className="mono">{row.part_class || "—"}</td>
                    <td className="mono">{row.session_id != null ? `#${row.session_id}` : "—"}</td>
                    <td className="mono">{row.vin || "—"}</td>
                    <td className="mono">{row.revision_no}</td>
                    <td>
                      {row.mask_uri ? (
                        <a href={maskAssetHref(row.mask_uri)} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!approvals.length && !approvalsError && (
            <p className="panel__muted table__empty">No mask revisions yet.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Recent sessions</h2>
        {sessionsError && <p className="help help--warn">{sessionsError}</p>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Status</th>
                <th>VIN</th>
                <th>Operator</th>
                <th>Opened</th>
                <th>Closed</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="mono">#{s.id}</td>
                  <td>
                    <span className={`sess-pill sess-pill--${s.status}`}>{s.status}</span>
                  </td>
                  <td className="mono">{s.vin}</td>
                  <td className="mono">{s.operator_id}</td>
                  <td>{formatTime(s.started_at)}</td>
                  <td>{s.ended_at ? formatTime(s.ended_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sessions.length && !sessionsError && (
            <p className="panel__muted table__empty">No sessions returned.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__title">Live channel</h2>
        <p className="panel__muted">Orchestration WebSocket — humanized.</p>
        <ul className="channel">
          {socketCards.map((c) => (
            <li key={c.key} className={`channel__row channel__row--${c.tone}`}>
              <span className="channel__label">{c.label}</span>
              <span className="channel__detail mono">{c.detail}</span>
            </li>
          ))}
          {!socketCards.length && (
            <li className="channel__empty">Waiting for messages…</li>
          )}
        </ul>
      </section>

      {showTechnical && (
        <section className="panel">
          <h2 className="panel__title">Technical feed</h2>
          <ul className="event-feed">
            {events.slice(0, 20).map((event, i) => (
              <li key={`${event.type}-${i}`} className="event-feed__row">
                <span className="event-feed__type">{event.type || "event"}</span>
                <pre className="event-feed__payload mono">
                  {JSON.stringify(event, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
