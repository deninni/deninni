import { INCIDENTS, activeIncidentAt, incidentWindowStart, type IncidentDef } from "./demo/engine";
import { MACHINES, type MachineId } from "./plants";
import type { AlertState } from "./store/store";

export interface Alert {
  id: string;
  machineId: MachineId;
  machineCode: string;
  code: string;
  title: string;
  component: string;
  severity: "WARN" | "FAULT";
  startedAt: string;
  endedAt: string | null;
  active: boolean;
  status: "NEW" | "ACKNOWLEDGED" | "CLOSED";
  acknowledgedBy?: string;
  comments: AlertState["comments"];
}

const MIN = 60_000;

/** Meldungen der letzten Stunden aus den deterministischen Demo-Vorfällen. */
export function deriveAlerts(states: Record<string, AlertState>, now = Date.now(), lookbackMin = 240): Alert[] {
  const out: Alert[] = [];
  for (const m of MACHINES) {
    for (const inc of INCIDENTS[m.id]) {
      const starts = windowStarts(inc, now - lookbackMin * MIN, now);
      for (const start of starts) {
        const id = `al-${m.id}-${inc.code}-${Math.round(start / MIN)}`;
        const end = start + inc.durationMin * MIN;
        const active = now < end && activeIncidentAt(m.id, now)?.code === inc.code;
        const st = states[id];
        out.push({
          id,
          machineId: m.id,
          machineCode: m.code,
          code: inc.code,
          title: inc.title,
          component: inc.component,
          severity: inc.severity,
          startedAt: new Date(start).toISOString(),
          endedAt: active ? null : new Date(end).toISOString(),
          active,
          status: st?.closedAt ? "CLOSED" : st?.acknowledgedAt ? "ACKNOWLEDGED" : "NEW",
          acknowledgedBy: st?.acknowledgedBy,
          comments: st?.comments ?? [],
        });
      }
    }
  }
  const sevRank = (a: Alert) => (a.active ? 0 : 2) + (a.severity === "FAULT" ? 0 : 1);
  return out.sort((a, b) => sevRank(a) - sevRank(b) || b.startedAt.localeCompare(a.startedAt));
}

function windowStarts(inc: IncidentDef, from: number, to: number): number[] {
  const res: number[] = [];
  const first = incidentWindowStart(inc, from);
  for (let s = first; s <= to; s += inc.periodMin * MIN) {
    if (s + inc.durationMin * MIN >= from) res.push(s);
  }
  return res;
}
