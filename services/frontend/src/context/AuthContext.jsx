import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { apiLogin, apiRegister } from "../lib/api";

const TOKEN_KEY = "noemodule_token";

function decodeJwtPayload(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

function loadStoredToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => loadStoredToken());

  const user = useMemo(() => {
    if (!token) return null;
    const p = decodeJwtPayload(token);
    if (!p) return null;
    return { id: p.user_id, username: p.sub, role: p.role };
  }, [token]);

  const storeToken = useCallback((t) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await apiLogin(username, password);
    storeToken(res.access_token);
    return res.user;
  }, [storeToken]);

  const register = useCallback(async (username, email, password) => {
    const res = await apiRegister(username, email, password);
    storeToken(res.access_token);
    return res.user;
  }, [storeToken]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, isAuthenticated: !!user, login, register, logout }),
    [token, user, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used under AuthProvider");
  return ctx;
}
