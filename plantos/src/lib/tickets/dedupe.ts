import type { Ticket } from "../store/store";

export const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING"] as const;

/**
 * Dedupe-Schlüssel: „[RCA] CODE · …“ → rca|machine|CODE (Vorrang), sonst alert|alertId.
 * Manuelle Tickets (ohne alertId, ohne [RCA]-Titel) werden nie gemergt → null.
 */
export function dedupeKey(t: { title: string; machineId: string | null; alertId: string | null }): string | null {
  const m = /^\[RCA\]\s+([A-Z0-9][A-Z0-9_-]*)\s*·/.exec(t.title.trim());
  if (m) return `rca|${t.machineId ?? "-"}|${m[1]}`;
  if (t.alertId) return `alert|${t.alertId}`;
  return null;
}

export function isOpen(t: Ticket): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(t.status);
}

export function findOpenDuplicate(tickets: Ticket[], key: string | null): Ticket | undefined {
  if (!key) return undefined;
  return tickets.find((t) => t.dedupeKey === key && isOpen(t));
}

/** Pro Gruppe bleibt das älteste offene Ticket; Rest → DONE + mergedInto. Nichts wird gelöscht. */
export function consolidate(tickets: Ticket[], now = new Date().toISOString()): { merged: number } {
  const groups = new Map<string, Ticket[]>();
  for (const t of tickets) {
    if (!t.dedupeKey || !isOpen(t)) continue;
    const g = groups.get(t.dedupeKey) ?? [];
    g.push(t);
    groups.set(t.dedupeKey, g);
  }
  let merged = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const keep = g[0];
    for (const dup of g.slice(1)) {
      keep.reportCount += dup.reportCount;
      if (dup.lastReportedAt > keep.lastReportedAt) keep.lastReportedAt = dup.lastReportedAt;
      dup.status = "DONE";
      dup.mergedInto = keep.id;
      dup.updatedAt = now;
      merged++;
    }
    keep.updatedAt = now;
  }
  return { merged };
}
