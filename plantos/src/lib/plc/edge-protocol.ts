import type { DataSource } from "../demo/engine";

export const EDGE_FRESH_MS = 15_000;
export const HEARTBEAT_FRESH_MS = 60_000;

export interface EdgeSample {
  machineId: string;
  agentId: string;
  origin: DataSource;
  ts: number;
  receivedAt: number;
  values: Record<string, number>;
  addresses?: Record<string, string>;
  readProof?: string;
  note?: string;
  s7Verified: boolean;
}

const S7_ADDR = /^(DB\d+\.DB[XBWD]\d+(\.\d)?|[MIQEA][BWD]?\d+(\.\d)?)$/i;

export function isS7Address(a: string): boolean {
  return S7_ADDR.test(a.trim());
}

/**
 * SIMULATED_EDGE ist nie S7. S7_EDGE nur mit numerischen Werten, ehrlicher Notiz und
 * S7-Adressen oder readProof. Formprüfung – kein kryptografischer Read-Beweis.
 */
export function enforceS7EdgeHonesty(input: {
  origin?: string;
  values?: Record<string, unknown>;
  addresses?: Record<string, string>;
  readProof?: string;
  note?: string;
}): { ok: true; origin: DataSource; s7Verified: boolean } | { ok: false; error: string } {
  const origin = (input.origin ?? "EDGE").toUpperCase();
  if (!["SIMULATED_EDGE", "S7_EDGE", "EDGE"].includes(origin)) {
    return { ok: false, error: `Unbekannte Herkunft „${input.origin}“. Erlaubt: SIMULATED_EDGE, S7_EDGE, EDGE.` };
  }
  const values = input.values ?? {};
  const keys = Object.keys(values);
  if (!keys.length) return { ok: false, error: "values fehlen" };
  for (const k of keys) {
    if (typeof values[k] !== "number" || !Number.isFinite(values[k] as number)) {
      return { ok: false, error: `Wert „${k}“ ist nicht numerisch` };
    }
  }
  if (origin !== "S7_EDGE") return { ok: true, origin: origin as DataSource, s7Verified: false };

  if (input.note && /simulat|stub|fallback|fake|demo/i.test(input.note)) {
    return { ok: false, error: "S7_EDGE abgelehnt: Notiz weist auf Simulation/Stub/Fallback hin." };
  }
  const addrs = Object.values(input.addresses ?? {});
  const validAddrs = addrs.filter(isS7Address);
  const hasProof = typeof input.readProof === "string" && input.readProof.length >= 8;
  if (!validAddrs.length && !hasProof) {
    return { ok: false, error: "S7_EDGE abgelehnt: keine gültigen S7-Adressen und kein readProof." };
  }
  return { ok: true, origin: "S7_EDGE", s7Verified: validAddrs.length > 0 && hasProof };
}

export type Freshness = "frisch" | "verzögert" | "veraltet" | "kein Edge";

export function freshness(lastSampleAt: number | null, lastHeartbeatAt: number | null, now = Date.now()): Freshness {
  if (lastSampleAt != null && now - lastSampleAt <= EDGE_FRESH_MS) return "frisch";
  if (lastHeartbeatAt != null && now - lastHeartbeatAt <= HEARTBEAT_FRESH_MS) return "verzögert";
  if (lastSampleAt != null || lastHeartbeatAt != null) return "veraltet";
  return "kein Edge";
}
