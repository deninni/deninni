import { sampleProfile, series, kpis, activeIncidentAt, INCIDENTS, incidentWindowStart, type Snapshot, type Variant, type Kpis } from "../demo/engine";
import type { GraphNode, MachineProps } from "../graph/model";
import type { MachineId } from "../plants";

/**
 * Telemetrie je Maschinen-Asset des Plant Brain.
 * Quelle ist die Demo-Engine (Profil + Variante); Bestandsanlagen in Werk Nord nutzen exakt dasselbe
 * Profil wie Live/Twin. Ergebnis trägt immer source (DEMO, bis ein Edge-Sample vorliegt).
 */
export function machineProps(n: GraphNode): MachineProps {
  return n.props as unknown as MachineProps;
}

export function variantOf(n: GraphNode): Variant | undefined {
  const p = machineProps(n);
  if (p.legacyId) return undefined;
  return { key: n.id, offsetMin: p.offsetMin ?? 0, driftPhaseDays: p.driftPhaseDays ?? 0 };
}

export function profileOf(n: GraphNode): MachineId {
  return machineProps(n).profile;
}

export function assetSnapshot(n: GraphNode, ts = Date.now()): Snapshot {
  return sampleProfile(profileOf(n), ts, variantOf(n));
}

export function assetSeries(n: GraphNode, from: number, to: number, stepMs: number): Snapshot[] {
  return series(profileOf(n), from, to, stepMs, variantOf(n));
}

export function assetKpis(n: GraphNode, to = Date.now(), windowMin = 480, stepMin = 1): Kpis {
  return kpis(profileOf(n), to, windowMin, variantOf(n), stepMin);
}

/** Anzahl Alarmfenster je Vorfallcode im Zeitraum (deterministisch aus dem Demo-Vorfallplan). */
export function assetAlarmCounts(n: GraphNode, from: number, to: number): Record<string, number> {
  const prof = profileOf(n);
  const off = (variantOf(n)?.offsetMin ?? 0) * 60_000;
  const res: Record<string, number> = {};
  for (const inc of INCIDENTS[prof]) {
    let count = 0;
    let s = incidentWindowStart(inc, from + off);
    if (s < from + off) s += inc.periodMin * 60_000;
    for (; s <= to + off; s += inc.periodMin * 60_000) count++;
    res[inc.code] = count;
  }
  return res;
}

export function assetActiveIncident(n: GraphNode, ts = Date.now()) {
  return activeIncidentAt(profileOf(n), ts, variantOf(n)?.offsetMin ?? 0);
}
