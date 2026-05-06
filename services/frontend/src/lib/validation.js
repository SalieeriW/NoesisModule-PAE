/** Normalize to uppercase A–Z and digits excluding I, O, Q per ISO 3779-style VIN alphabet. */
export function normalizeVin(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "");
}

/** Strict 17-character VIN (production line). */
export function isValidVin17(v) {
  return normalizeVin(v).length === 17;
}

/** Optional: allow internal / demo tokens for non-homologated cells (clearly labeled). */
export function isValidVinOrDemo(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (s.startsWith("DEMO-") && /^DEMO-[A-Z0-9]{4,24}$/.test(s)) return true;
  return isValidVin17(raw);
}

export function vinHint() {
  return "Use a 17-character VIN (no I, O, Q), or a demo vehicle id DEMO-XXXX for lab use.";
}
