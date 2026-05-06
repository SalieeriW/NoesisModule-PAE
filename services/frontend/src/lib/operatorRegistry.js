const STORAGE_KEY = "paintcell_operators_v1";
const ACTIVE_KEY = "paintcell_active_operator_id";

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function generateOperatorCode() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `OP-${suffix}`;
}

export function loadOperators() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const list = safeParse(raw, []);
  return Array.isArray(list) ? list : [];
}

export function saveOperators(operators) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(operators));
}

export function getActiveOperatorId() {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveOperatorId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function validateBadgeId(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (s.length < 4 || s.length > 12) {
    return { ok: false, error: "Badge ID must be 4–12 letters or digits." };
  }
  return { ok: true, value: s };
}

export function validateDisplayName(raw) {
  const s = String(raw || "").trim();
  if (s.length < 2 || s.length > 64) {
    return { ok: false, error: "Display name must be 2–64 characters." };
  }
  return { ok: true, value: s };
}

export function addOperatorRecord({ displayName, badgeId }) {
  const dn = validateDisplayName(displayName);
  if (!dn.ok) return { ok: false, error: dn.error };
  const bd = validateBadgeId(badgeId);
  if (!bd.ok) return { ok: false, error: bd.error };

  const operators = loadOperators();
  const duplicate = operators.some((o) => o.badgeId === bd.value);
  if (duplicate) {
    return { ok: false, error: "An operator with this badge ID already exists." };
  }

  const record = {
    id: generateOperatorCode(),
    displayName: dn.value,
    badgeId: bd.value,
    createdAt: new Date().toISOString()
  };
  operators.push(record);
  saveOperators(operators);
  return { ok: true, operator: record };
}

export function removeOperator(id) {
  const operators = loadOperators().filter((o) => o.id !== id);
  saveOperators(operators);
  if (getActiveOperatorId() === id) setActiveOperatorId(null);
}

export function getOperatorById(id) {
  return loadOperators().find((o) => o.id === id) || null;
}
