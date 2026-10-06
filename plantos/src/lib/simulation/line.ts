import { computePhysics } from "../twin/physics";
import { round } from "../analytics/stats";

/**
 * Linien-Simulation (Modell): Bandantrieb (Kräfte, Drehmoment, Motorlast, Energie),
 * Produktstabilität (Kippen), Puffer/Stau zwischen Füller und Packer, Taktzeit und Durchsatz.
 * Jede Größe ist gekennzeichnet: Messwert | Modellwert | Annahme | Simulation.
 * Simulationsergebnisse sind NIE der echte Produktionszustand.
 */
export type ValueKind = "Messwert" | "Modellwert" | "Annahme" | "Simulation";

export interface SimInput {
  beltSpeedMs: number;
  accelerationMs2: number;
  productMassKg: number;
  pitchM: number;
  beltLengthM: number;
  frictionCoeff: number;
  rollerRadiusM: number;
  gearEfficiency: number;
  motorRatedKw: number;
  bufferCapacity: number;
  fillerCycleS: number;
  packerCycleS: number;
  bottleFormat: string;
  durationMin: number;
}

export interface SimValue { label: string; value: number; unit: string; kind: ValueKind }

export interface SimResult {
  inputs: Record<keyof SimInput, { value: number | string; kind: ValueKind }>;
  outputs: Record<string, SimValue>;
  timeline: { minute: number; buffer: number; produced: number; blocked: boolean }[];
  warnings: string[];
  disclaimer: string;
}

export const DEFAULT_INPUT: SimInput = {
  beltSpeedMs: 1.25, accelerationMs2: 0.5, productMassKg: 1.03, pitchM: 0.1, beltLengthM: 12, frictionCoeff: 0.25,
  rollerRadiusM: 0.1, gearEfficiency: 0.9, motorRatedKw: 2.2, bufferCapacity: 400, fillerCycleS: 0.1, packerCycleS: 0.105, bottleFormat: "1.0", durationMin: 60,
};

const LIMITS: Record<keyof SimInput, [number, number]> = {
  beltSpeedMs: [0.1, 3], accelerationMs2: [0, 5], productMassKg: [0.1, 5], pitchM: [0.05, 1], beltLengthM: [1, 100], frictionCoeff: [0.05, 0.8],
  rollerRadiusM: [0.03, 0.5], gearEfficiency: [0.5, 1], motorRatedKw: [0.25, 50], bufferCapacity: [0, 5000], fillerCycleS: [0.03, 10], packerCycleS: [0.03, 10],
  bottleFormat: [0, 0], durationMin: [5, 480],
};

export function sanitizeInput(raw: Partial<Record<keyof SimInput, unknown>>): SimInput {
  const out = { ...DEFAULT_INPUT };
  for (const k of Object.keys(DEFAULT_INPUT) as (keyof SimInput)[]) {
    if (raw[k] == null) continue;
    if (k === "bottleFormat") { out.bottleFormat = ["0.5", "1.0", "1.25", "1.5"].includes(String(raw[k])) ? String(raw[k]) : "1.0"; continue; }
    const n = Number(raw[k]);
    if (Number.isFinite(n)) (out as Record<string, number | string>)[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], n));
  }
  return out;
}

export function simulateLine(input: SimInput, measured: Partial<Record<keyof SimInput, boolean>> = {}): SimResult {
  const g = 9.81;
  const onBelt = Math.floor(input.beltLengthM / input.pitchM);
  const mass = onBelt * input.productMassKg;
  const fFriction = input.frictionCoeff * mass * g;
  const fAccel = mass * input.accelerationMs2;
  const torqueRun = (fFriction * input.rollerRadiusM) / input.gearEfficiency;
  const torquePeak = ((fFriction + fAccel) * input.rollerRadiusM) / input.gearEfficiency;
  const pRunKw = (fFriction * input.beltSpeedMs) / input.gearEfficiency / 1000;
  const pPeakKw = ((fFriction + fAccel) * input.beltSpeedMs) / input.gearEfficiency / 1000;
  const loadPct = (pRunKw / input.motorRatedKw) * 100;

  // Produktstabilität am Sternrad: Bandgeschwindigkeit → Geschwindigkeit % (1,45 m/s = 100 %)
  const phys = computePhysics((input.beltSpeedMs / 1.45) * 100, input.bottleFormat);
  const microStopsPerHour = Math.max(0, (phys.tipRiskPct - 15) * 0.6);

  // Fluid-Modell: Zufuhr vom Füller (begrenzt durch Bandkapazität), Abfuhr durch Packer
  const beltCap = input.beltSpeedMs / input.pitchM;
  const fillerCap = 1 / input.fillerCycleS;
  const packerCap = 1 / input.packerCycleS;
  let buffer = input.bufferCapacity / 2, produced = 0, blockedS = 0, starvedS = 0;
  const timeline: SimResult["timeline"] = [];
  const total = input.durationMin * 60;
  const stopEvery = microStopsPerHour > 0 ? 3600 / microStopsPerHour : Infinity;
  for (let t = 0; t < total; t++) {
    const inMicroStop = Number.isFinite(stopEvery) && t % Math.round(stopEvery) < 20; // 20 s je Mikrostopp (Annahme)
    let inflow = inMicroStop ? 0 : Math.min(beltCap, fillerCap);
    if (buffer >= input.bufferCapacity && inflow > packerCap) { inflow = Math.min(inflow, packerCap); blockedS++; }
    const outflow = buffer > 0 || inflow > 0 ? Math.min(packerCap, buffer + inflow) : 0;
    if (buffer <= 0 && inflow < packerCap) starvedS++;
    buffer = Math.max(0, Math.min(input.bufferCapacity, buffer + inflow - outflow));
    produced += outflow;
    if (t % 60 === 59) timeline.push({ minute: (t + 1) / 60, buffer: Math.round(buffer), produced: Math.round(produced), blocked: blockedS > 0 && buffer >= input.bufferCapacity });
  }
  const throughputH = (produced / total) * 3600;
  const effCycle = produced > 0 ? total / produced : Infinity;
  const energyKwh = (pRunKw * total) / 3600;

  const warnings: string[] = [];
  if (loadPct > 100) warnings.push("Motorlast > 100 % – Antrieb überlastet (Modell).");
  if (torquePeak / Math.max(1e-9, torqueRun) > 2.5) warnings.push("Hohe Beschleunigungsspitze – Anfahrrampe prüfen.");
  if (phys.verdict !== "unkritisch") warnings.push(`Produktstabilität ${phys.verdict}: Kipprisiko ${phys.tipRiskPct} %.`);
  if (blockedS > total * 0.05) warnings.push(`Stau: Puffer ${Math.round((blockedS / total) * 100)} % der Zeit voll – Packer begrenzt.`);
  if (beltCap < fillerCap) warnings.push("Bandkapazität begrenzt den Füller.");

  const kind = (k: keyof SimInput): ValueKind => (measured[k] ? "Messwert" : k === "motorRatedKw" || k === "bufferCapacity" || k === "fillerCycleS" || k === "packerCycleS" ? "Modellwert" : "Annahme");
  const inputs = Object.fromEntries((Object.keys(input) as (keyof SimInput)[]).map((k) => [k, { value: input[k], kind: kind(k) }])) as SimResult["inputs"];
  const o = (label: string, value: number, unit: string, d = 1): SimValue => ({ label, value: round(value, d), unit, kind: "Simulation" });

  return {
    inputs,
    outputs: {
      throughput: o("Durchsatz", throughputH, "Einheiten/h", 0),
      cycleTime: o("Effektive Taktzeit", effCycle, "s/Einheit", 3),
      torqueRun: o("Drehmoment Dauerbetrieb", torqueRun, "Nm"),
      torquePeak: o("Drehmoment Anfahren", torquePeak, "Nm"),
      motorLoad: o("Motorlast", loadPct, "%"),
      powerPeak: o("Leistungsspitze", pPeakKw, "kW", 2),
      energy: o("Energie Bandantrieb", energyKwh, "kWh", 2),
      energyPerUnit: o("Energie je Einheit", produced > 0 ? (energyKwh * 1000) / produced : 0, "Wh", 3),
      tipRisk: o("Kipprisiko (Stabilität)", phys.tipRiskPct, "%", 0),
      microStops: o("Mikrostopps", microStopsPerHour, "1/h"),
      jamTime: o("Stauzeit (Puffer voll)", blockedS / 60, "min"),
      starvedTime: o("Leerlauf Packer", starvedS / 60, "min"),
      bufferEnd: o("Pufferfüllung Ende", buffer, "Einheiten", 0),
    },
    timeline,
    warnings,
    disclaimer: "Simulation auf Basis eines vereinfachten Modells. Keine Aussage über den echten Produktionszustand, keine Wirkung auf die Anlage.",
  };
}
