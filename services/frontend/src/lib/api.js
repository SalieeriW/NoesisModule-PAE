const TOKEN_KEY = "paintcell_token";

function normalizeApiBase() {
  const raw = import.meta.env.VITE_API_BASE;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "/api/v1";
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api/v1`;
  }
  return "http://localhost:8080/api/v1";
}

const API_BASE = normalizeApiBase();

function authHeader() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Turn `sim/runtime/...` paths from the API into absolute URLs. */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${API_BASE}/${p}`;
}

export function maskAssetHref(uri) {
  if (!uri) return "#";
  const u = String(uri).trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/api/")) return u;
  return apiUrl(u);
}

export function maskDisplayUrl(stored) {
  if (!stored) return "";
  const u = String(stored).trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/api/")) return u;
  return apiUrl(u);
}

export async function fetchAsBlob(url) {
  const resp = await fetch(url, { headers: authHeader() });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

// ── Auth endpoints (no auth header needed) ────────────────────────────────────

export async function apiLogin(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiRegister(username, email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchPublicStats() {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) return null;
  return res.json();
}

// ── Protected endpoints ────────────────────────────────────────────────────────

export async function listMaskRevisionsForDetection(detectionId) {
  const res = await fetch(`${API_BASE}/masks/detection/${detectionId}/revisions`, {
    headers: authHeader(),
  });
  if (!res.ok) handleUnauth(res);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchRuntimeStatus() {
  const res = await fetch(`${API_BASE}/sim/runtime/status`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startSession(payload) {
  return post("/sessions", payload);
}

export async function closeSession(sessionId) {
  return post(`/sessions/${sessionId}/close`, {});
}

export async function createCapture(payload) {
  return post("/captures", payload);
}

export async function createDetection(payload) {
  return post("/detections", payload);
}

export async function createMaskRevision(payload) {
  return post("/masks/revisions", payload);
}

export async function createPaintJob(payload) {
  return post("/paint-jobs", payload);
}

export async function executePaintJob(paintJobId) {
  return post(`/paint-jobs/${paintJobId}/execute`, {});
}

export async function cancelPaintJob(paintJobId) {
  return post(`/paint-jobs/${paintJobId}/cancel`, {});
}

export async function simStart() {
  return post("/sim/runtime/start", {});
}

export async function simStop() {
  return post("/sim/runtime/stop", {});
}

export async function simCapture() {
  return post("/sim/runtime/capture", {});
}

export async function simDetect() {
  return post("/sim/runtime/detect", {});
}

export function simLatestViewUrl() {
  return `${API_BASE}/sim/runtime/view/latest.jpg`;
}

export function simStreamViewUrl() {
  return `${API_BASE}/sim/runtime/view/stream.mjpg`;
}

export async function uploadMaskPng(blob) {
  const fd = new FormData();
  fd.append("file", blob, "mask.png");
  const res = await fetch(`${API_BASE}/sim/runtime/masks/upload`, {
    method: "POST",
    headers: authHeader(),
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listSessions(limit = 40) {
  const res = await fetch(`${API_BASE}/sessions?limit=${limit}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listRecentMaskRevisions(limit = 50) {
  const res = await fetch(`${API_BASE}/masks/revisions/recent?limit=${limit}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function chatCommand(message, history = []) {
  return post("/chat", { message, history });
}

function handleUnauth(res) {
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/login";
  }
}

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    handleUnauth(res);
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
