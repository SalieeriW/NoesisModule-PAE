import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";

export function Register() {
  const { isAuthenticated, register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await register(username.trim(), email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <Link to="/" className="auth-page__back">← PaintCell</Link>

      <div className="auth-card fade-in">
        <div className="auth-card__brand">
          <Logo size={32} />
          <h1 className="auth-card__title">Create account</h1>
        </div>

        <p className="auth-card__sub">Register as a PaintCell operator.</p>

        {error && (
          <div className="banner banner--error banner--compact">
            <p>{error}</p>
          </div>
        )}

        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Username</span>
            <input
              className="field__input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              minLength={3}
              required
              disabled={busy}
            />
            <span className="field__hint">3–64 characters. Used to sign in.</span>
          </label>
          <label className="field">
            <span className="field__label">Email</span>
            <input
              type="email"
              className="field__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <input
              type="password"
              className="field__input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={busy}
            />
            <span className="field__hint">Minimum 8 characters.</span>
          </label>
          <label className="field">
            <span className="field__label">Confirm password</span>
            <input
              type="password"
              className="field__input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              disabled={busy}
            />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-card__switch">
          Already have an account?{" "}
          <Link to="/login" className="auth-card__link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function parseError(err) {
  const msg = String(err?.message || err);
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.detail) return parsed.detail;
  } catch {}
  return msg;
}
