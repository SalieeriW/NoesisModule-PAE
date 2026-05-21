import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWorkbench } from "../context/WorkbenchContext";
import { MiniViewport } from "../components/MiniViewport";
import { fetchPublicStats } from "../lib/api";

function formatTime(ts) {
  if (!ts) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(ts));
  } catch { return String(ts); }
}

const KIND_ICON = { session: "○", capture: "◈", detection: "◉", mask: "◎", paint: "●" };
const KIND_COLOR = { session: "chip--neutral", capture: "chip--neutral", detection: "chip--ok", mask: "chip--paint", paint: "chip--ok" };

export function Overview() {
  const { user } = useAuth();
  const {
    session, detection, revision, paintJob,
    busy, operatorStatus, paintProgress, milestones, runtimeStatus,
  } = useWorkbench();

  const [stats, setStats] = useState(null);
  useEffect(() => { fetchPublicStats().then(setStats).catch(() => {}); }, []);

  const barPercent = paintJob ? paintProgress : 0;
  const runtimeOk = runtimeStatus === "running";
  const simState = operatorStatus?.sim_state;

  return (
    <div className="page fade-in">

      {/* ── greeting row ── */}
      <div className="ov-header">
        <div>
          <h1 className="ov-header__name">Good shift, {user?.username || "operator"}.</h1>
          <p className="ov-header__sub">
            {session ? `Session #${session.id} active` : "No active session"}
            {simState ? ` · Webots ${simState}` : ""}
          </p>
        </div>
        <div className="chip-row">
          <span className={`chip ${runtimeOk ? "chip--ok" : "chip--neutral"}`}>
            Webots {runtimeOk ? "● running" : "stopped"}
          </span>
        </div>
      </div>

      {/* ── stat cards ── */}
      {stats && (
        <div className="ov-stats">
          <StatCard label="Sessions" value={stats.sessions} icon="○" />
          <StatCard label="Detections" value={stats.detections} icon="◉" />
          <StatCard label="Mask revisions" value={stats.mask_revisions} icon="◎" />
          <StatCard label="Paint jobs" value={stats.paint_jobs} icon="●" />
        </div>
      )}

      {/* ── main grid: job status + viewport ── */}
      <div className="ov-main">
        <div className="ov-main__left">
          {session ? (
            <div className="ov-job-card">
              <p className="ov-job-card__heading">Active job</p>
              <div className="ov-job-card__grid">
                <JobStat label="Session" value={`#${session.id}`} />
                <JobStat label="Part" value={detection ? detection.part_class.replace(/_/g, " ") : "—"} />
                <JobStat label="Mask" value={revision ? `Rev #${revision.id} ✓` : "Pending"} />
                <JobStat label="Paint" value={paintJob ? `#${paintJob.id} · ${paintJob.status}` : "—"} />
              </div>
              {paintJob && (
                <>
                  <div className="ov-prog">
                    <div className="ov-prog__fill" style={{ width: `${barPercent}%` }} />
                  </div>
                  <p className="ov-prog__label">{barPercent}% complete</p>
                </>
              )}
              <Link to="/process" className="btn btn--sm" style={{ alignSelf: "flex-start" }}>
                Continue in Process →
              </Link>
            </div>
          ) : (
            <div className="ov-idle-card">
              <p className="ov-idle-card__text">No active session</p>
              <p className="ov-idle-card__hint">
                Open Process to scan a vehicle, detect parts, approve the mask, and execute a paint job.
              </p>
              <Link to="/process" className="btn btn--lg">Start new job →</Link>
            </div>
          )}

          {/* recent activity */}
          {milestones.length > 0 && (
            <div className="ov-activity">
              <p className="ov-activity__heading">This shift</p>
              <ul className="ov-timeline">
                {milestones.slice(0, 8).map((m) => (
                  <li key={m.id} className="ov-tl-row">
                    <span className={`chip ${KIND_COLOR[m.kind] || "chip--neutral"} ov-tl-row__kind`}>
                      {KIND_ICON[m.kind] || "·"}
                    </span>
                    <div className="ov-tl-row__body">
                      <span className="ov-tl-row__title">{m.title}</span>
                      <span className="ov-tl-row__detail">{m.detail}</span>
                    </div>
                    <time className="ov-tl-row__time mono">{formatTime(m.ts)}</time>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* right: live viewport */}
        <div className="ov-main__right">
          <MiniViewport showControls />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="ov-stat-card">
      <span className="ov-stat-card__icon">{icon}</span>
      <span className="ov-stat-card__value">{value?.toLocaleString() ?? "—"}</span>
      <span className="ov-stat-card__label">{label}</span>
    </div>
  );
}

function JobStat({ label, value }) {
  return (
    <div>
      <p className="ov-job-card__label">{label}</p>
      <p className="ov-job-card__value">{value}</p>
    </div>
  );
}
