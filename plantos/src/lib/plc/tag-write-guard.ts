/**
 * Schreibschutz: plantOS ist gegenüber Maschinen READ ONLY.
 * Telemetrie/Tags, die nach Schreibabsicht aussehen, werden abgelehnt.
 */
const WRITE_PATTERNS = [
  /\bwrite\b/i, /\bwrites\b/i, /set_?point/i, /sollwert/i, /shutdown/i, /\bforce\b/i, /override/i,
  /\bcommand\b/i, /\bcmd\b/i, /\bstop_?request\b/i, /abschalt/i, /\bschreib/i,
];

const WRITE_KEYS = ["write", "writes", "setpoint", "setpoints", "command", "commands", "force", "override", "sollwert"];

export interface WriteGuardResult {
  ok: boolean;
  reason?: string;
}

export function checkTagName(name: string): WriteGuardResult {
  for (const p of WRITE_PATTERNS) {
    if (p.test(name)) return { ok: false, reason: `Tag „${name}“ hat Schreib-Form (${p.source}) – plantOS liest nur.` };
  }
  return { ok: true };
}

/** Prüft eine Telemetrie-Payload: keine Schreib-Felder, keine Schreib-Tags. */
export function guardTelemetry(body: unknown): WriteGuardResult {
  if (!body || typeof body !== "object") return { ok: false, reason: "Payload fehlt" };
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    if (WRITE_KEYS.includes(k.toLowerCase())) return { ok: false, reason: `Feld „${k}“ ist eine Schreibabsicht – plantOS liest nur.` };
  }
  const values = b.values;
  if (values && typeof values === "object") {
    for (const k of Object.keys(values as object)) {
      const r = checkTagName(k);
      if (!r.ok) return r;
    }
  }
  return { ok: true };
}
