import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function initials(name) {
  if (!name) return "?";
  return name.slice(0, 2).toUpperCase();
}

export function Team() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="page fade-in">
      <h1 className="page__title" style={{ marginBottom: 28 }}>Profile</h1>

      <div className="profile-card panel">
        <div className="profile-avatar">{initials(user?.username)}</div>

        {user ? (
          <>
            <h2 className="profile-name">{user.username}</h2>
            <p className="profile-role">{user.role}</p>

            <dl className="kv profile-kv">
              <div>
                <dt>User ID</dt>
                <dd className="mono">{user.id}</dd>
              </div>
              <div>
                <dt>Account type</dt>
                <dd className="mono">{user.role}</dd>
              </div>
            </dl>

            <button
              className="btn btn--ghost"
              onClick={() => { logout(); navigate("/"); }}
            >
              Sign out
            </button>
          </>
        ) : (
          <p className="panel__muted">No operator signed in.</p>
        )}
      </div>
    </div>
  );
}
