import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useOperator } from "../context/OperatorContext";
import { useWorkbench } from "../context/WorkbenchContext";

const nav = [
  { to: "/", label: "Overview", end: true },
  { to: "/simulation", label: "Simulation" },
  { to: "/inspection", label: "Inspection" },
  { to: "/mask", label: "Mask approval" },
  { to: "/production", label: "Production" },
  { to: "/activity", label: "Operations" },
  { to: "/team", label: "Team" }
];

export function AppShell() {
  const { activeOperator, signOut } = useOperator();
  const { operatorStatus, runtimeStatus } = useWorkbench();
  const navigate = useNavigate();

  const rgbAge = operatorStatus?.rgb_age_seconds;
  const feedLive =
    typeof rgbAge === "number" && rgbAge >= 0 && rgbAge < 1.8;

  return (
    <div className="shell">
      <aside className="shell__rail" aria-label="Primary">
        <div className="shell__brand">
          <span className="shell__mark" aria-hidden />
          <div>
            <p className="shell__product">PaintCell</p>
            <p className="shell__tagline">Workcell control</p>
          </div>
        </div>

        <nav className="shell__nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                "shell__link" + (isActive ? " shell__link--active" : "")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shell__rail-footer">
          {activeOperator ? (
            <div className="shell__operator">
              <p className="shell__operator-name">{activeOperator.displayName}</p>
              <p className="shell__operator-id mono">{activeOperator.id}</p>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  signOut();
                  navigate("/team");
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <p className="shell__hint">No operator signed in.</p>
          )}
        </div>
      </aside>

      <div className="shell__main">
        <header className="shell__top">
          <div className="shell__status-row">
            <span
              className={
                "pill" + (runtimeStatus === "running" ? " pill--ok" : " pill--muted")
              }
            >
              Runtime {runtimeStatus === "running" ? "live" : "stopped"}
            </span>
            <span
              className={
                "pill" + (feedLive ? " pill--ok" : " pill--warn")
              }
            >
              Viewport {feedLive ? "live" : rgbAge == null ? "unknown" : "stale"}
            </span>
            {typeof rgbAge === "number" && (
              <span className="pill pill--muted mono">{rgbAge.toFixed(2)}s frame</span>
            )}
          </div>
        </header>
        <main className="shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
