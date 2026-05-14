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

/** Turn `sim/runtime/...` paths from the API into absolute URLs. */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${API_BASE}/${p}`;
}

/**
 * Browser-openable href for mask PNGs. Handles `sim/runtime/masks/...`, full http(s) URLs, and
 * paths already prefixed with `/api/...` (must not run through apiUrl again — that doubles `/api/v1`).
 */
export function maskAssetHref(uri) {
  if (!uri) return "#";
  const u = String(uri).trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/api/")) return u;
  return apiUrl(u);
}

/** URL suitable for `<img>` / canvas `loadImage` (same-origin relative `/api/...` or absolute). */
export function maskDisplayUrl(stored) {
  if (!stored) return "";
  const u = String(stored).trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/api/")) return u;
  return apiUrl(u);
}

export async function listMaskRevisionsForDetection(detectionId) {
  const res = await fetch(`${API_BASE}/masks/detection/${detectionId}/revisions`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchRuntimeStatus() {
  const res = await fetch(`${API_BASE}/sim/runtime/status`);
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

/** Upload operator-edited mask PNG; returns `{ mask_uri, filename }` (paths relative to sim). */
export async function uploadMaskPng(blob) {
  const fd = new FormData();
  fd.append("file", blob, "mask.png");
  const res = await fetch(`${API_BASE}/sim/runtime/masks/upload`, {
    method: "POST",
    body: fd
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listSessions(limit = 40) {
  const res = await fetch(`${API_BASE}/sessions?limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listRecentMaskRevisions(limit = 50) {
  const res = await fetch(`${API_BASE}/masks/revisions/recent?limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function chatCommand(message, history = []) {
  return post("/chat", { message, history });
}

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
