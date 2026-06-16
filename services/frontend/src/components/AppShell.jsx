import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWorkbench } from "../context/WorkbenchContext";
import { Logo } from "./Logo";

const nav = [
  { to: "/dashboard", label: "Overview", end: true },
  { to: "/process", label: "Process" },
  { to: "/history", label: "History" },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { runtimeStatus } = useWorkbench();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <aside className="shell__rail" aria-label="Primary">
        <div className="shell__brand">
          <Logo size={36} />
          <div>
            <p className="shell__product">NoeModule</p>
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
          {user ? (
            <div className="shell__operator">
              <p className="shell__operator-name">{user.username}</p>
              <p className="shell__operator-id mono">{user.role}</p>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => { logout(); navigate("/"); }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <p className="shell__hint">Not signed in.</p>
          )}
        </div>
      </aside>

      <div className="shell__main">
        <main className="shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
