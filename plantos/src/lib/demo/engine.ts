import { MACHINES, type MachineId, getMachine } from "../plants";
import { smoothNoise, noise01 } from "./rng";

/**
 * plantOS Demo-Engine.
 * Rein deterministisch: Werte sind eine Funktion von (Anlage, Zeitpunkt). Dadurch sind
 * Live, Historie, Berichte und Tests konsistent, ohne dass Zeitreihen gespeichert werden müssen.
 * DEMO ist Default – jede Ausgabe trägt source "DEMO".
 */

export type MachineState = "RUNNING" | "WARN" | "FAULT" | "STOPPED";
export type DataSource = "DEMO" | "SIMULATED_EDGE" | "S7_EDGE" | "EDGE";

export interface Signals {
  speedPercent: number;
  motorCurrentA: number;
  temperatureC: number;
  vibrationMmS: number;
  outputRate: number;
  rejectRatePct: number;
}

export interface Snapshot {
  machineId: MachineId;
  ts: number;
  state: MachineState;
  signals: Signals;
  activeIncident: IncidentDef | null;
  source: DataSource;
}

export interface IncidentDef {
  code: string;
  title: string;
  component: string;
  severity: "WARN" | "FAULT";
  periodMin: number; // Wiederholung
  offsetMin: number;
  durationMin: number;
}

/** Wiederkehrende Demo-Vorfälle (deterministisch), damit Meldungen, RCA und Historie Inhalt haben. */
export const INCIDENTS: Record<MachineId, IncidentDef[]> = {
  "m-af12": [
    { code: "TEMP-M001", title: "Temperatur Hauptantrieb M-001 erhöht", component: "m-001", severity: "WARN", periodMin: 47, offsetMin: 5, durationMin: 9 },
    { code: "TIP-SR03", title: "Flaschenkippen an Sternrad SR-03", component: "sr-03", severity: "WARN", periodMin: 113, offsetMin: 61, durationMin: 5 },
  ],
  "m-vl3": [
    { code: "TUN-TEMP", title: "Shrink-Tunnel Übertemperatur", component: "vl-tunnel", severity: "WARN", periodMin: 71, offsetMin: 20, durationMin: 8 },
  ],
  "m-ft7": [
    { code: "CUR-A3", title: "Stromspitze Antrieb A3 (Segment B)", component: "ft-m-b", severity: "FAULT", periodMin: 89, offsetMin: 33, durationMin: 4 },
    { code: "JAM-SRT", title: "Stau im Sorter Segment B", component: "ft-seg-b", severity: "WARN", periodMin: 131, offsetMin: 90, durationMin: 6 },
  ],
};

const BASE: Record<MachineId, { speed: number; current: number; temp: number; vib: number }> = {
  "m-af12": { speed: 86, current: 18.5, temp: 46, vib: 2.1 },
  "m-vl3": { speed: 78, current: 11.2, temp: 52, vib: 1.6 },
  "m-ft7": { speed: 72, current: 7.8, temp: 39, vib: 2.8 },
};

const MIN = 60_000;

export function activeIncidentAt(machineId: MachineId, ts: number): IncidentDef | null {
  const minute = ts / MIN;
  for (const inc of INCIDENTS[machineId]) {
    const phase = (((minute - inc.offsetMin) % inc.periodMin) + inc.periodMin) % inc.periodMin;
    if (phase < inc.durationMin) return inc;
  }
  return null;
}

/** Start (ms) des Vorfallfensters, falls ts in einem liegt – stabile Alert-IDs. */
export function incidentWindowStart(inc: IncidentDef, ts: number): number {
  const minute = ts / MIN;
  const phase = (((minute - inc.offsetMin) % inc.periodMin) + inc.periodMin) % inc.periodMin;
  return Math.round((minute - phase) * MIN);
}

/** Geplanter Kurzstopp (Formatwechsel/Reinigung) – senkt Verfügbarkeit realistisch. */
function plannedStop(machineId: MachineId, ts: number): boolean {
  const minute = Math.floor(ts / MIN);
  const cycle = machineId === "m-af12" ? 240 : machineId === "m-vl3" ? 300 : 360;
  const off = machineId === "m-af12" ? 200 : machineId === "m-vl3" ? 140 : 17;
  return ((minute - off) % cycle + cycle) % cycle < 6;
}

export function sampleMachine(machineId: MachineId, ts: number = Date.now()): Snapshot {
  const b = BASE[machineId];
  const def = getMachine(machineId)!;
  const inc = activeIncidentAt(machineId, ts);
  const stopped = plannedStop(machineId, ts);

  const n1 = smoothNoise(machineId + ":speed", ts, 45_000);
  const n2 = smoothNoise(machineId + ":cur", ts, 20_000);
  const n3 = smoothNoise(machineId + ":temp", ts, 180_000);
  const n4 = smoothNoise(machineId + ":vib", ts, 8_000);
  const jitter = noise01(machineId + ":j", Math.floor(ts / 2000)) - 0.5;

  let speed = b.speed + n1 * 4 + jitter * 0.6;
  let current = b.current * (speed / b.speed) + n2 * 0.6 + jitter * 0.2;
  let temp = b.temp + n3 * 2.2;
  let vib = b.vib + n4 * 0.35;
  let reject = 0.6 + Math.max(0, n2) * 0.4;

  if (inc) {
    const ramp = Math.min(1, (((ts / MIN - inc.offsetMin) % inc.periodMin) + inc.periodMin) % inc.periodMin / 2);
    switch (inc.code) {
      case "TEMP-M001":
        temp += 14 * ramp; current += 2.6 * ramp; vib += 0.8 * ramp; break;
      case "TIP-SR03":
        reject += 3.2 * ramp; vib += 1.1 * ramp; break;
      case "TUN-TEMP":
        temp += 16 * ramp; reject += 1.4 * ramp; break;
      case "CUR-A3":
        current += 6.5 * ramp; vib += 2.4 * ramp; speed -= 18 * ramp; break;
      case "JAM-SRT":
        speed -= 22 * ramp; reject += 2.1 * ramp; break;
    }
  }

  if (stopped) {
    speed = 0; current = 0.4; vib = 0.1; reject = 0;
  }

  speed = clamp(speed, 0, 100);
  const output = stopped ? 0 : (def.nominalRate * speed) / 100 * (1 - reject / 100);
  const state: MachineState = stopped ? "STOPPED" : inc ? inc.severity : "RUNNING";

  return {
    machineId,
    ts,
    state,
    activeIncident: stopped ? null : inc,
    source: "DEMO",
    signals: {
      speedPercent: round(speed, 1),
      motorCurrentA: round(current, 2),
      temperatureC: round(temp, 1),
      vibrationMmS: round(vib, 2),
      outputRate: round(output, 1),
      rejectRatePct: round(reject, 2),
    },
  };
}

export function sampleAll(ts: number = Date.now()): Snapshot[] {
  return MACHINES.map((m) => sampleMachine(m.id, ts));
}

/** Zeitreihe aus der Engine (Historie = Engine zu vergangenen Zeitpunkten). */
export function series(machineId: MachineId, fromTs: number, toTs: number, stepMs: number): Snapshot[] {
  const out: Snapshot[] = [];
  const start = Math.floor(fromTs / stepMs) * stepMs;
  for (let t = start; t <= toTs; t += stepMs) out.push(sampleMachine(machineId, t));
  return out;
}

export interface Kpis {
  availabilityPct: number;
  performancePct: number;
  qualityPct: number;
  oeePct: number;
  goodUnits: number;
  windowMin: number;
}

/** OEE nach Standarddefinition über ein Zeitfenster (Default: laufende Schicht 8 h, Raster 1 min). */
export function kpis(machineId: MachineId, toTs: number = Date.now(), windowMin = 480): Kpis {
  const pts = series(machineId, toTs - windowMin * MIN, toTs, MIN);
  const running = pts.filter((p) => p.state !== "STOPPED");
  const availability = running.length / pts.length;
  const perf = running.length ? running.reduce((s, p) => s + p.signals.speedPercent, 0) / running.length / 100 : 0;
  const quality = running.length ? 1 - running.reduce((s, p) => s + p.signals.rejectRatePct, 0) / running.length / 100 : 0;
  const good = running.reduce((s, p) => s + p.signals.outputRate, 0);
  return {
    availabilityPct: round(availability * 100, 1),
    performancePct: round(perf * 100, 1),
    qualityPct: round(quality * 100, 1),
    oeePct: round(availability * perf * quality * 100, 1),
    goodUnits: Math.round(good),
    windowMin,
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
export function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
