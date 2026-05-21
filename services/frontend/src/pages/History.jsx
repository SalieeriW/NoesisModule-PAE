import { useCallback, useEffect, useState } from "react";
import { listSessions, listRecentMaskRevisions, maskAssetHref, fetchAsBlob } from "../lib/api";

const PAGE_SIZE = 10;

function formatTs(ts) {
  if (!ts) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(ts));
  } catch { return String(ts); }
}

export function History() {
  const [tab, setTab] = useState("sessions");
  const [sessions, setSessions] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessPage, setSessPage] = useState(1);
  const [appvPage, setAppvPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, a] = await Promise.all([
        listSessions(200),
        listRecentMaskRevisions(200),
      ]);
      setSessions(s);
      setApprovals(a);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page fade-in">
      <div className="hist-header">
        <div>
          <h1 className="page__title">History</h1>
          <p className="page__lede">Sessions and mask approvals across all operators.</p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div className="banner banner--error banner--compact"><p>{error}</p></div>}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-btn${tab === "sessions" ? " tab-btn--active" : ""}`}
          onClick={() => setTab("sessions")}
        >
          Sessions
          <span className="tab-btn__count">{sessions.length}</span>
        </button>
        <button
          className={`tab-btn${tab === "approvals" ? " tab-btn--active" : ""}`}
          onClick={() => setTab("approvals")}
        >
          Mask Approvals
          <span className="tab-btn__count">{approvals.length}</span>
        </button>
      </div>

      {tab === "sessions" && (
        <SessionsTab
          rows={sessions}
          page={sessPage}
          onPageChange={setSessPage}
          loading={loading}
        />
      )}
      {tab === "approvals" && (
        <ApprovalsTab
          rows={approvals}
          page={appvPage}
          onPageChange={setAppvPage}
          loading={loading}
        />
      )}
    </div>
  );
}

/* ── Sessions tab ──────────────────────────────────────────────────── */

function SessionsTab({ rows, page, onPageChange, loading }) {
  const total = rows.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="hist-tab fade-in">
      <div className="hist-table-wrap">
        <table className="hist-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>VIN</th>
              <th>Operator</th>
              <th>Opened</th>
              <th>Closed</th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && !loading && (
              <tr><td colSpan={6} className="hist-table__empty">No sessions yet.</td></tr>
            )}
            {slice.map((s) => (
              <tr key={s.id}>
                <td className="mono">#{s.id}</td>
                <td>
                  <span className={`sess-pill sess-pill--${s.status}`}>{s.status}</span>
                </td>
                <td className="mono">{s.vin}</td>
                <td className="mono">{s.operator_id}</td>
                <td>{formatTs(s.started_at)}</td>
                <td>{s.ended_at ? formatTs(s.ended_at) : <span className="chip chip--ok" style={{fontSize:11}}>active</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={totalPages} onChange={onPageChange} count={total} noun="sessions" />
    </div>
  );
}

/* ── Authenticated mask link ───────────────────────────────────────── */

function MaskLink({ uri }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      const blobUrl = await fetchAsBlob(maskAssetHref(uri));
      const win = window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      if (!win) URL.revokeObjectURL(blobUrl);
    } catch (e) {
      alert(`Could not open mask: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="hist-link" onClick={open} disabled={busy}>
      {busy ? "…" : "View"}
    </button>
  );
}

/* ── Approvals tab ─────────────────────────────────────────────────── */

function ApprovalsTab({ rows, page, onPageChange, loading }) {
  const total = rows.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="hist-tab fade-in">
      <div className="hist-table-wrap">
        <table className="hist-table">
          <thead>
            <tr>
              <th>Rev</th>
              <th>Part</th>
              <th>Session</th>
              <th>VIN</th>
              <th>Operator</th>
              <th>Notes</th>
              <th>Approved</th>
              <th>Mask</th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && !loading && (
              <tr><td colSpan={8} className="hist-table__empty">No mask approvals yet.</td></tr>
            )}
            {slice.map((row) => (
              <tr key={row.id}>
                <td className="mono">#{row.revision_no}</td>
                <td className="mono">{row.part_class || "—"}</td>
                <td className="mono">{row.session_id != null ? `#${row.session_id}` : "—"}</td>
                <td className="mono">{row.vin || "—"}</td>
                <td className="mono">{row.author_id || "—"}</td>
                <td className="hist-table__notes" title={row.notes || ""}>
                  {row.notes?.trim() || <span className="hist-table__muted">—</span>}
                </td>
                <td>{formatTs(row.created_at)}</td>
                <td>
                  {row.mask_uri ? (
                    <MaskLink uri={row.mask_uri} />
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={totalPages} onChange={onPageChange} count={total} noun="approvals" />
    </div>
  );
}

/* ── Pagination ────────────────────────────────────────────────────── */

function Pagination({ page, total, onChange, count, noun }) {
  if (total <= 1) {
    return (
      <p className="hist-pagination__info">
        {count} {noun}
      </p>
    );
  }
  return (
    <div className="hist-pagination">
      <p className="hist-pagination__info">
        Page {page} of {total} · {count} {noun}
      </p>
      <div className="hist-pagination__btns">
        <button
          className="btn btn--ghost btn--sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          ← Prev
        </button>
        {Array.from({ length: total }, (_, i) => i + 1)
          .filter((p) => Math.abs(p - page) <= 2)
          .map((p) => (
            <button
              key={p}
              className={`btn btn--sm${p === page ? "" : " btn--ghost"}`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          ))}
        <button
          className="btn btn--ghost btn--sm"
          disabled={page >= total}
          onClick={() => onChange(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
