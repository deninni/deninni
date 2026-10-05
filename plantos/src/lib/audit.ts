import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir } from "./store/store";

/**
 * Append-only Audit-Log (JSON Lines, ein File pro Tag).
 * Für Enterprise-Kunden: wer hat wann was gemeldet, bestätigt, angelegt, exportiert.
 */
export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  target?: string;
  detail?: string;
  ok?: boolean;
}

function auditDir() {
  return path.join(dataDir(), "audit");
}

export async function audit(entry: Omit<AuditEntry, "at">): Promise<void> {
  const e: AuditEntry = { at: new Date().toISOString(), ...entry };
  try {
    await fs.mkdir(auditDir(), { recursive: true });
    await fs.appendFile(path.join(auditDir(), `${e.at.slice(0, 10)}.jsonl`), JSON.stringify(e) + "\n", "utf8");
  } catch {
    // Audit darf den Request nicht brechen; Fehler landen im Server-Log.
    console.error("[plantOS] Audit-Write fehlgeschlagen", e.action);
  }
}

export async function readAudit(limit = 200): Promise<AuditEntry[]> {
  try {
    const files = (await fs.readdir(auditDir())).filter((f) => f.endsWith(".jsonl")).sort().reverse();
    const out: AuditEntry[] = [];
    for (const f of files) {
      const lines = (await fs.readFile(path.join(auditDir(), f), "utf8")).trim().split("\n").reverse();
      for (const l of lines) {
        if (!l) continue;
        try { out.push(JSON.parse(l)); } catch { /* defekte Zeile überspringen */ }
        if (out.length >= limit) return out;
      }
    }
    return out;
  } catch {
    return [];
  }
}
