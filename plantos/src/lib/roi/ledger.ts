import type { GraphIndex } from "../graph/queries";
import type { MemoryEntry } from "../memory/model";

/**
 * „plantOS Value Generated“: nur aus Industrial-Memory-Einträgen.
 * - realisiert: Ergebnis-Eintrag (outcome) mit verified=true und avoidedCostEur
 * - freigegeben/erwartet: Freigabe (humanApproval) mit expectedNetBenefitEur, noch ohne Ergebnis
 * Demo-Einträge werden getrennt ausgewiesen und nie als real summiert.
 */
export interface ValueItem {
  memoryId: string;
  at: string;
  assetId: string;
  plantId: string | null;
  lineId: string | null;
  machineId: string | null;
  amount: number;
  kind: "realized" | "approved";
  demo: boolean;
  description: string;
}

export function valueItems(g: GraphIndex, memory: MemoryEntry[]): ValueItem[] {
  const outcomesFor = new Set(memory.filter((m) => m.type === "outcome" && m.links.relatedEntryId).map((m) => m.links.relatedEntryId!));
  const items: ValueItem[] = [];
  for (const m of memory) {
    let amount: number | null = null;
    let kind: ValueItem["kind"] | null = null;
    if (m.type === "outcome" && m.meta.verified === true && typeof m.meta.avoidedCostEur === "number" && m.meta.avoidedCostEur > 0) {
      amount = m.meta.avoidedCostEur; kind = "realized";
    } else if (m.type === "humanApproval" && typeof m.meta.expectedNetBenefitEur === "number" && !outcomesFor.has(String(m.meta.approves ?? ""))) {
      amount = m.meta.expectedNetBenefitEur; kind = "approved";
    }
    if (amount == null || !kind) continue;
    items.push({
      memoryId: m.id, at: m.at, assetId: m.assetId,
      plantId: g.ancestorOfType(m.assetId, "plant")?.id ?? null,
      lineId: g.ancestorOfType(m.assetId, "line")?.id ?? null,
      machineId: g.ancestorOfType(m.assetId, "machine")?.id ?? null,
      amount, kind, demo: m.demo, description: m.description,
    });
  }
  return items;
}

export type Period = "today" | "week" | "month" | "year";
export const PERIOD_LABEL: Record<Period, string> = { today: "Heute", week: "Woche (7 T.)", month: "Monat (30 T.)", year: "Jahr (365 T.)" };

export function periodStart(p: Period, now = Date.now()): number {
  if (p === "today") { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
  return now - (p === "week" ? 7 : p === "month" ? 30 : 365) * 86_400_000;
}

export interface ValueSummary {
  periods: Record<Period, { realized: number; realizedDemo: number; approved: number; approvedDemo: number }>;
  byPlant: Record<string, number>;
  byLine: Record<string, number>;
  byMachine: Record<string, number>;
  items: ValueItem[];
  allDemo: boolean;
}

export function summarizeValue(items: ValueItem[], scopeIds: Set<string> | null, now = Date.now()): ValueSummary {
  const inScope = items.filter((i) => !scopeIds || scopeIds.has(i.assetId));
  const periods = {} as ValueSummary["periods"];
  for (const p of ["today", "week", "month", "year"] as Period[]) {
    const from = periodStart(p, now);
    const sel = inScope.filter((i) => Date.parse(i.at) >= from && Date.parse(i.at) <= now);
    const sum = (k: ValueItem["kind"], demo: boolean) => Math.round(sel.filter((i) => i.kind === k && i.demo === demo).reduce((a, i) => a + i.amount, 0));
    periods[p] = { realized: sum("realized", false), realizedDemo: sum("realized", true), approved: sum("approved", false), approvedDemo: sum("approved", true) };
  }
  const group = (key: "plantId" | "lineId" | "machineId") => {
    const r: Record<string, number> = {};
    for (const i of inScope.filter((x) => x.kind === "realized")) if (i[key]) r[i[key]!] = (r[i[key]!] ?? 0) + i.amount;
    return r;
  };
  return { periods, byPlant: group("plantId"), byLine: group("lineId"), byMachine: group("machineId"), items: inScope, allDemo: inScope.every((i) => i.demo) };
}
