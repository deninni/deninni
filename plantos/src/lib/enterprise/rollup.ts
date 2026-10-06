import type { GraphIndex } from "../graph/queries";
import type { GraphNode, SparePartProps } from "../graph/model";
import type { Prediction } from "../predictive/engine";
import type { ValueItem } from "../roi/ledger";
import { assetSeries, assetKpis, assetAlarmCounts } from "../assets/telemetry";
import { round, mean } from "../analytics/stats";

/** Kennzahlen je Maschine (24 h, 5-min-Raster) und Aggregation auf jede Hierarchieebene. */
export interface MachineMetrics {
  assetId: string;
  code: string;
  name: string;
  state: string;
  oeePct: number;
  availabilityPct: number;
  qualityPct: number;
  stopMinutes24h: number;
  alarms24h: number;
  energyKwh24h: number;
  riskScore: number;
  priority: Prediction["priority"];
  predictiveAlert: boolean;
  maintenanceDue14d: boolean;
  sparePartsBelowMin: number;
  valueRealized: number;
  valueDemo: boolean;
  source: "DEMO";
}

const D = 86_400_000;

export function machineMetrics(n: GraphNode, g: GraphIndex, pred: Prediction | undefined, values: ValueItem[], now = Date.now()): MachineMetrics {
  const pts = assetSeries(n, now - D, now, 300_000);
  const k = assetKpis(n, now, 480, 5);
  const stops = pts.filter((p) => p.state === "STOPPED" || p.state === "FAULT").length * 5;
  const kwh = pts.reduce((a, p) => a + p.signals.powerKw * (5 / 60), 0);
  const alarms = Object.values(assetAlarmCounts(n, now - D, now)).reduce((a, b) => a + b, 0);
  const parts = g.sparePartsOf(n.id).filter((sp) => { const p = sp.props as unknown as SparePartProps; return p.stock < p.minStock; }).length;
  const mv = values.filter((v) => v.machineId === n.id && v.kind === "realized");
  return {
    assetId: n.id, code: n.code ?? n.name, name: n.name, state: pts.at(-1)?.state ?? "RUNNING",
    oeePct: k.oeePct, availabilityPct: k.availabilityPct, qualityPct: k.qualityPct, stopMinutes24h: stops, alarms24h: alarms,
    energyKwh24h: round(kwh, 0), riskScore: pred?.riskScore ?? 0, priority: pred?.priority ?? "P4",
    predictiveAlert: !!pred && (pred.priority === "P1" || pred.priority === "P2"),
    maintenanceDue14d: !!pred?.window && Date.parse(pred.window.from) <= now + 14 * D,
    sparePartsBelowMin: parts, valueRealized: Math.round(mv.reduce((a, v) => a + v.amount, 0)), valueDemo: mv.every((v) => v.demo), source: "DEMO",
  };
}

export interface ScopeKpis {
  id: string;
  type: string;
  name: string;
  code?: string;
  machines: number;
  oeePct: number;
  availabilityPct: number;
  qualityPct: number;
  stopMinutes24h: number;
  alarms24h: number;
  energyKwh24h: number;
  riskMax: number;
  predictiveAlerts: number;
  maintenanceDue14d: number;
  sparePartsBelowMin: number;
  valueRealized: number;
  critical: { assetId: string; code: string; riskScore: number; priority: string }[];
  children: ScopeKpis[];
}

const ROLLUP_TYPES = new Set(["company", "region", "country", "site", "plant", "area", "line"]);

export function rollup(g: GraphIndex, scopeId: string, metrics: Map<string, MachineMetrics>, depth = 1): ScopeKpis | null {
  const node = g.node(scopeId);
  if (!node) return null;
  const ms = g.machinesUnder(scopeId).map((m) => metrics.get(m.id)).filter(Boolean) as MachineMetrics[];
  const childNodes = node.type === "machine" ? [] : g.children(scopeId).filter((c) => ROLLUP_TYPES.has(c.type) || c.type === "machine");
  return {
    id: node.id, type: node.type, name: node.name, code: node.code, machines: ms.length,
    oeePct: round(mean(ms.map((m) => m.oeePct)) || 0, 1),
    availabilityPct: round(mean(ms.map((m) => m.availabilityPct)) || 0, 1),
    qualityPct: round(mean(ms.map((m) => m.qualityPct)) || 0, 1),
    stopMinutes24h: ms.reduce((a, m) => a + m.stopMinutes24h, 0),
    alarms24h: ms.reduce((a, m) => a + m.alarms24h, 0),
    energyKwh24h: ms.reduce((a, m) => a + m.energyKwh24h, 0),
    riskMax: Math.max(0, ...ms.map((m) => m.riskScore)),
    predictiveAlerts: ms.filter((m) => m.predictiveAlert).length,
    maintenanceDue14d: ms.filter((m) => m.maintenanceDue14d).length,
    sparePartsBelowMin: ms.reduce((a, m) => a + m.sparePartsBelowMin, 0),
    valueRealized: ms.reduce((a, m) => a + m.valueRealized, 0),
    critical: ms.filter((m) => m.riskScore >= 45).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5).map((m) => ({ assetId: m.assetId, code: m.code, riskScore: m.riskScore, priority: m.priority })),
    children: depth > 0 ? childNodes.map((c) => rollup(g, c.id, metrics, depth - 1)).filter(Boolean) as ScopeKpis[] : [],
  };
}

/** Tägliche OEE eines Scopes (Trend Woche/Monat). */
export function oeeTrend(g: GraphIndex, scopeId: string, days: number, now = Date.now()): { day: string; oeePct: number }[] {
  const ms = g.machinesUnder(scopeId);
  const res: { day: string; oeePct: number }[] = [];
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const end = today.getTime() - i * D + D;
    const to = Math.min(end, now);
    const vals = ms.map((m) => assetKpis(m, to, Math.max(10, Math.round((to - (end - D)) / 60_000)), 15).oeePct);
    res.push({ day: new Date(end - D).toISOString().slice(0, 10), oeePct: round(mean(vals) || 0, 1) });
  }
  return res;
}
