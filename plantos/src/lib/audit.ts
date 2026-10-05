import { createHash } from "node:crypto";
import { appendLine, readLines } from "./tenant/store";

/**
 * Manipulationserkennbares Audit-Log (append-only, Hash-Kette je Tenant).
 * Jeder Eintrag enthält den Hash des Vorgängers; verifyAudit() erkennt Änderungen oder Löschungen.
 */
export interface AuditEntry {
  seq: number;
  at: string;
  tenant: string;
  actor: string;
  action: string;
  target?: string;
  detail?: string;
  ok?: boolean;
  prevHash: string;
  hash: string;
}

export type AuditInput = Omit<AuditEntry, "seq" | "at" | "prevHash" | "hash" | "tenant"> & { tenant?: string };

const heads = new Map<string, Promise<{ seq: number; hash: string }>>();

function hashOf(e: Omit<AuditEntry, "hash">): string {
  const { seq, at, tenant, actor, action, target, detail, ok, prevHash } = e;
  return createHash("sha256").update(JSON.stringify([seq, at, tenant, actor, action, target ?? null, detail ?? null, ok ?? null, prevHash])).digest("hex");
}

async function headOf(tenant: string) {
  const lines = await readLines<AuditEntry>(tenant, "audit");
  const last = lines.at(-1);
  return { seq: last?.seq ?? 0, hash: last?.hash ?? "GENESIS" };
}

export async function audit(input: AuditInput): Promise<void> {
  const tenant = input.tenant ?? "demo";
  const prev = heads.get(tenant) ?? headOf(tenant);
  const next = prev.then(async (h) => {
    const base = {
      seq: h.seq + 1,
      at: new Date().toISOString(),
      tenant,
      actor: input.actor,
      action: input.action,
      target: input.target,
      detail: input.detail?.slice(0, 500),
      ok: input.ok,
      prevHash: h.hash,
    };
    const entry: AuditEntry = { ...base, hash: hashOf(base) };
    await appendLine(tenant, "audit", entry);
    return { seq: entry.seq, hash: entry.hash };
  });
  heads.set(tenant, next.catch(() => headOf(tenant)));
  try {
    await next;
  } catch {
    console.error("[plantOS] Audit-Write fehlgeschlagen", input.action);
  }
}

export async function readAudit(limit = 200, tenant = "demo"): Promise<AuditEntry[]> {
  const lines = await readLines<AuditEntry>(tenant, "audit");
  return lines.slice(-limit).reverse();
}

export async function verifyAudit(tenant = "demo"): Promise<{ ok: boolean; entries: number; brokenAt?: number }> {
  const lines = await readLines<AuditEntry>(tenant, "audit");
  let prev = "GENESIS";
  for (const e of lines) {
    const { hash, ...rest } = e;
    if (e.prevHash !== prev || hashOf(rest) !== hash) return { ok: false, entries: lines.length, brokenAt: e.seq };
    prev = hash;
  }
  return { ok: true, entries: lines.length };
}

/** Nur für Tests. */
export function __resetAuditHeads() {
  heads.clear();
}
