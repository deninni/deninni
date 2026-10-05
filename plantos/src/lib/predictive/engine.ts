import type { GraphNode } from "../graph/model";
import type { GraphIndex } from "../graph/queries";
import type { MemoryEntry } from "../memory/model";
import type { Snapshot, Signals } from "../demo/engine";
import { BASE } from "../demo/engine";
import { assetSeries, assetAlarmCounts, machineProps, profileOf } from "../assets/telemetry";
import { linreg, median, clamp, round, normCdf } from "../analytics/stats";
import { confidenceLabel, type Explanation } from "../analytics/explain";

/**
 * Predictive-Maintenance-Engine.
 * - Trend je Signal über Tagesmediane (nur Betriebszeit), lineare Regression mit Standardfehler
 * - Restlebensdauer (RUL) NUR bei belastbarem Trend (R² ≥ 0,7, |t| ≥ 4, ≥ 10 Tage, Abdeckung ≥ 70 %)
 * - sonst ausdrücklich: „Nicht genügend Daten für eine belastbare Restlebensdauerprognose.“
 */
export const NO_RUL_TEXT = "Nicht genügend Daten für eine belastbare Restlebensdauerprognose.";

type SigKey = keyof Pick<Signals, "vibrationMmS" | "temperatureC" | "motorCurrentA" | "pressureBar" | "powerKw">;

export interface Limit { warn: number; alarm: number; dir: "up" | "down"; unit: string; label: string; basis: string }

export function limitsFor(n: GraphNode): Partial<Record<SigKey, Limit>> {
  const prof = profileOf(n);
  const rated = machineProps(n).ratedCurrentA ?? BASE[prof].current * 1.15;
  const L: Partial<Record<SigKey, Limit>> = {
    vibrationMmS: { warn: 4.5, alarm: 7.1, dir: "up", unit: "mm/s", label: "Schwingung", basis: "ISO 10816-3 Zonen C/D (Annahme Gruppe 2, starr)" },
    motorCurrentA: { warn: rated, alarm: rated * 1.15, dir: "up", unit: "A", label: "Motorstrom", basis: "Bemessungsstrom laut Stammdaten" },
  };
  L.temperatureC = prof === "m-vl3"
    ? { warn: 62, alarm: 75, dir: "up", unit: "°C", label: "Tunneltemperatur", basis: "Prozessgrenze Folie (Annahme)" }
    : { warn: 70, alarm: 85, dir: "up", unit: "°C", label: "Motortemperatur", basis: "Gehäusetemperatur Isolierstoffklasse F (Annahme)" };
  if (prof === "m-af12") L.pressureBar = { warn: 4.6, alarm: 4.3, dir: "down", unit: "bar", label: "Fülldruck", basis: "Prozessfenster Füller (Annahme)" };
  return L;
}

const FAILURE_MODE: Record<SigKey, { mode: string; materials: string[]; alternatives: string[]; check: string; jobHours: number; technicians: number; eventDowntimeH: number }> = {
  vibrationMmS: { mode: "Lagerschaden", materials: ["4711"], alternatives: ["Unwucht (Rotor/Kupplung)", "Ausrichtfehler Motor–Getriebe", "Lose Befestigung / Fundament"], check: "Schwingungsspektrum (Hüllkurve) am Lager AS messen, Lagergeräusch prüfen, Schmierzustand", jobHours: 4, technicians: 2, eventDowntimeH: 6.5 },
  temperatureC: { mode: "Übertemperatur / Kühlung", materials: [], alternatives: ["Verschmutzte Kühlrippen/Lüfter", "Überlast durch Mechanik", "Umgebungstemperatur"], check: "Thermografie Motor/Tunnel, Lüfter und Kühlrippen prüfen", jobHours: 2, technicians: 1, eventDowntimeH: 4 },
  motorCurrentA: { mode: "Mechanische Schwergängigkeit", materials: ["4714"], alternatives: ["Verschleiß Getriebe", "Verschmutzung Fördergut", "Spannungsunsymmetrie"], check: "Leerlaufstrom messen, Getriebeöl und Kupplung prüfen", jobHours: 3, technicians: 1, eventDowntimeH: 5 },
  pressureBar: { mode: "Druckabfall Füllsystem", materials: ["4712"], alternatives: ["Pumpenverschleiß", "Undichtigkeit Ventilsitz", "Produkttemperatur"], check: "Dichtungen Füllventile, Pumpendruck vor Ort prüfen", jobHours: 3, technicians: 2, eventDowntimeH: 3 },
  powerKw: { mode: "Ineffizienz", materials: [], alternatives: [], check: "Energieanalyse prüfen", jobHours: 1, technicians: 1, eventDowntimeH: 0 },
};

export interface SignalTrend {
  signal: SigKey;
  label: string;
  unit: string;
  days: number;
  level: number;
  slopePerDay: number;
  r2: number;
  t: number;
  significant: boolean;
  /** belastbarer Trend, aber Grenze liegt jenseits 3× Beobachtungsfenster */
  beyondHorizon: boolean;
  limit?: Limit;
  daysToWarn: number | null;
  daysToAlarm: number | null;
  daysToAlarmRange: [number, number] | null;
  daily: { day: string; value: number }[];
}

export interface Prediction {
  assetId: string;
  code: string;
  name: string;
  computedAt: string;
  source: "DEMO" | "EDGE";
  riskScore: number;
  priority: "P1" | "P2" | "P3" | "P4";
  failureProbability30d: number;
  dominant: SigKey | null;
  failureMode: string | null;
  rul: { days: number; range: [number, number]; to: string } | null;
  rulText: string;
  window: { from: string; to: string; reason: string } | null;
  trends: SignalTrend[];
  runtimeHoursSinceMaintenance: number | null;
  lastMaintenanceAt: string | null;
  maintenanceIntervalH: number;
  switchCycles7d: number;
  alarms7d: number;
  materials: string[];
  job: { hours: number; technicians: number; eventDowntimeH: number };
  explanation: Explanation;
}

const D = 86_400_000;
const MAINT_TYPES = new Set(["maintenance", "partReplacement", "repair"]);

export function predictAsset(n: GraphNode, g: GraphIndex, memory: MemoryEntry[], now = Date.now(), days = 21): Prediction {
  const from = now - days * D;
  const pts = assetSeries(n, from, now, 3_600_000);
  const running = pts.filter((p) => p.state !== "STOPPED");
  const limits = limitsFor(n);
  const signals: SigKey[] = ["vibrationMmS", "temperatureC", "motorCurrentA", "pressureBar", "powerKw"];
  const prof = profileOf(n);

  // Tagesmediane
  const byDay = new Map<number, Snapshot[]>();
  for (const p of running) {
    const d = Math.floor((p.ts - from) / D);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(p);
  }
  const dayIdx = [...byDay.keys()].filter((d) => byDay.get(d)!.length >= 6).sort((a, b) => a - b);
  const coverage = dayIdx.length / days;

  const trends: SignalTrend[] = [];
  for (const s of signals) {
    if (s === "pressureBar" && prof !== "m-af12") continue;
    const ys = dayIdx.map((d) => median(byDay.get(d)!.map((p) => p.signals[s])));
    const reg = linreg(dayIdx, ys);
    const today = days - 0.5;
    const level = reg.intercept + reg.slope * today;
    const lim = limits[s];
    const towardLimit = lim ? (lim.dir === "up" ? reg.slope > 0 : reg.slope < 0) : false;
    let significant = dayIdx.length >= 10 && coverage >= 0.7 && reg.r2 >= 0.7 && Math.abs(reg.t) >= 4 && towardLimit;
    let beyondHorizon = false;
    // Keine Extrapolation weit über den Beobachtungszeitraum hinaus (max. 3× Fenster)
    if (significant && lim && Math.abs(reg.slope) > 0 && (lim.dir === "up" ? lim.alarm - level : level - lim.alarm) / Math.abs(reg.slope) > 3 * days) { significant = false; beyondHorizon = true; }
    const dist = (target: number) => (lim ? (lim.dir === "up" ? target - level : level - target) : NaN);
    const speed = Math.abs(reg.slope);
    const daysTo = (target: number) => (significant && speed > 0 ? Math.max(0, dist(target) / speed) : null);
    let range: [number, number] | null = null;
    if (significant && lim) {
      const fast = speed + 2 * reg.seSlope, slow = Math.max(1e-9, speed - 2 * reg.seSlope);
      range = [round(Math.max(0, dist(lim.alarm) / fast), 1), round(Math.max(0, dist(lim.alarm) / slow), 1)];
    }
    trends.push({
      signal: s, label: lim?.label ?? (s === "powerKw" ? "Leistung" : s), unit: lim?.unit ?? (s === "powerKw" ? "kW" : ""),
      days: dayIdx.length, level: round(level, 2), slopePerDay: round(reg.slope, 4), r2: round(reg.r2, 3), t: round(reg.t, 1), significant, beyondHorizon, limit: lim,
      daysToWarn: lim ? (dist(lim.warn) <= 0 ? 0 : daysTo(lim.warn) != null ? round(daysTo(lim.warn)!, 1) : null) : null,
      daysToAlarm: lim && daysTo(lim.alarm) != null ? round(daysTo(lim.alarm)!, 1) : null,
      daysToAlarmRange: range,
      daily: dayIdx.map((d, i) => ({ day: new Date(from + d * D).toISOString().slice(0, 10), value: round(ys[i], 2) })),
    });
  }

  // Wartungshistorie (Industrial Memory) für Maschine + Unterknoten
  const subtree = new Set([n.id, ...g.descendants(n.id).map((x) => x.id)]);
  const maint = memory.filter((m) => subtree.has(m.assetId) && MAINT_TYPES.has(m.type)).sort((a, b) => b.at.localeCompare(a.at))[0];
  const intervalH = machineProps(n).maintenanceIntervalH ?? 3000;
  let runtimeH: number | null = null;
  if (maint) {
    const since = Date.parse(maint.at);
    const hours = assetSeries(n, since, now, 3_600_000);
    runtimeH = hours.filter((p) => p.state !== "STOPPED").length;
  }
  const five = assetSeries(n, now - 7 * D, now, 300_000);
  let cycles = 0;
  for (let i = 1; i < five.length; i++) if (five[i - 1].state === "STOPPED" && five[i].state !== "STOPPED") cycles++;
  const alarms7d = Object.values(assetAlarmCounts(n, now - 7 * D, now)).reduce((a, b) => a + b, 0);

  // Risiko
  const withLimit = trends.filter((t) => t.limit);
  const levelFrac = (t: SignalTrend) => {
    const nominal = t.signal === "vibrationMmS" ? BASE[prof].vib : t.signal === "temperatureC" ? BASE[prof].temp : t.signal === "motorCurrentA" ? BASE[prof].current : 5.15;
    const l = t.limit!;
    const span = l.dir === "up" ? l.alarm - nominal : nominal - l.alarm;
    const pos = l.dir === "up" ? t.level - nominal : nominal - t.level;
    return clamp(pos / span, 0, 1);
  };
  const sig = withLimit.filter((t) => t.daysToAlarm != null).sort((a, b) => a.daysToAlarm! - b.daysToAlarm!);
  const dominantTrend = sig[0] ?? [...withLimit].sort((a, b) => levelFrac(b) - levelFrac(a))[0];
  const sTrend = sig[0] ? clamp(1 - sig[0].daysToAlarm! / 60, 0, 1) : 0;
  const sLevel = Math.max(0, ...withLimit.map(levelFrac));
  const sMaint = runtimeH != null ? clamp(runtimeH / intervalH - 0.7, 0, 0.3) / 0.3 : 0;
  const sAlarm = clamp(alarms7d / 250, 0, 1);
  const riskScore = Math.round(100 * clamp(0.45 * sTrend + 0.3 * sLevel + 0.15 * sMaint + 0.1 * sAlarm, 0, 1));
  const priority = riskScore >= 70 ? "P1" : riskScore >= 45 ? "P2" : riskScore >= 25 ? "P3" : "P4";

  let p30 = riskScore / 100 * 0.3;
  let rul: Prediction["rul"] = null;
  if (sig[0]?.daysToAlarmRange) {
    const [lo, hi] = sig[0].daysToAlarmRange;
    const mid = sig[0].daysToAlarm!;
    const sigma = Math.max(1, (hi - lo) / 4);
    p30 = clamp(normCdf((30 - mid) / sigma), 0, 0.98);
    rul = { days: mid, range: [lo, hi], to: sig[0].limit!.label + " Alarmgrenze " + sig[0].limit!.alarm.toLocaleString("de-DE") + " " + sig[0].limit!.unit };
  }

  // Wartungsfenster
  let window: Prediction["window"] = null;
  const dom = dominantTrend?.signal ?? null;
  if (sig[0]) {
    const latest = Math.max(0, (sig[0].daysToAlarmRange?.[0] ?? sig[0].daysToAlarm!) - 3);
    const earliest = Math.max(0, latest - 14);
    window = { from: new Date(now + earliest * D).toISOString(), to: new Date(now + latest * D).toISOString(), reason: `vor Erreichen der Alarmgrenze (untere Prognosegrenze − 3 Tage Sicherheit)` };
  } else if (dominantTrend && levelFrac(dominantTrend) >= 0.6) {
    window = { from: new Date(now).toISOString(), to: new Date(now + 7 * D).toISOString(), reason: "Messwert nahe Grenze ohne belastbaren Trend – Inspektion, keine Prognose" };
  } else if (runtimeH != null && runtimeH >= intervalH * 0.9) {
    window = { from: new Date(now).toISOString(), to: new Date(now + 14 * D).toISOString(), reason: "Wartungsintervall (Laufzeit) fast erreicht" };
  }

  const concern = !!sig[0] || riskScore >= 25 || !!window;
  const fm = dom && concern ? FAILURE_MODE[dom] : null;
  const confScore = sig[0] ? clamp(sig[0].r2 * coverage * Math.min(1, sig[0].days / 14), 0, 1) : clamp(coverage * 0.6, 0, 1);
  const missing = ["Drehmoment", "Durchfluss"];
  if (prof !== "m-af12") missing.push("Druck");
  if (!maint) missing.push("Wartungshistorie im Industrial Memory");
  if (dayIdx.length < 10) missing.push(`ausreichende Historie (nur ${dayIdx.length} Tage)`);

  const reasoning: string[] = [];
  for (const t of withLimit) {
    reasoning.push(`${t.label}: ${t.level.toLocaleString("de-DE")} ${t.unit}, Trend ${t.slopePerDay >= 0 ? "+" : ""}${t.slopePerDay.toLocaleString("de-DE")} ${t.unit}/Tag (R² ${t.r2.toLocaleString("de-DE")}, t=${t.t.toLocaleString("de-DE")}) – ${t.significant ? "belastbarer Trend" : "kein belastbarer Trend"}`);
  }
  if (runtimeH != null) reasoning.push(`Laufzeit seit letzter Wartung: ${runtimeH} h von ${intervalH} h Intervall`);
  reasoning.push(`${alarms7d} Alarmfenster in 7 Tagen, ${cycles} Start/Stopp-Zyklen`);

  return {
    assetId: n.id, code: n.code ?? n.name, name: n.name, computedAt: new Date(now).toISOString(), source: "DEMO",
    riskScore, priority, failureProbability30d: round(p30, 2), dominant: concern ? dom : null, failureMode: fm?.mode ?? null,
    rul, rulText: rul
      ? `${rul.days.toLocaleString("de-DE")} Tage bis ${rul.to} (Bereich ${rul.range[0].toLocaleString("de-DE")}–${rul.range[1].toLocaleString("de-DE")} Tage)`
      : trends.some((t) => t.beyondHorizon)
        ? `Belastbarer Trend (${trends.filter((t) => t.beyondHorizon).map((t) => t.label).join(", ")}), Alarmgrenze nicht innerhalb von ${3 * days} Tagen – keine Restlebensdauer-Angabe über den belastbaren Prognosebereich hinaus.`
        : NO_RUL_TEXT,
    window, trends, runtimeHoursSinceMaintenance: runtimeH, lastMaintenanceAt: maint?.at ?? null, maintenanceIntervalH: intervalH,
    switchCycles7d: cycles, alarms7d, materials: fm?.materials ?? [], job: { hours: fm?.jobHours ?? 2, technicians: fm?.technicians ?? 1, eventDowntimeH: fm?.eventDowntimeH ?? 4 },
    explanation: {
      method: "Lineare Regression über Tagesmediane (Betriebszeit) + Grenzwertabstand + Wartungs-/Alarmhistorie",
      usedData: [
        ...trends.map((t) => ({ signal: t.label, source: "DEMO-Engine", samples: t.days, note: "Tagesmediane aus Stundenwerten" })),
        { signal: "Industrial Memory (Wartung)", source: maint ? "Memory" : "–", samples: maint ? 1 : 0 },
        { signal: "Alarmhistorie", source: "DEMO-Vorfallplan", samples: alarms7d },
      ],
      period: { from: new Date(from).toISOString(), to: new Date(now).toISOString() },
      reasoning,
      confidence: { score: round(confScore, 2), label: confidenceLabel(confScore), why: sig[0] ? `R² ${sig[0].r2}, ${sig[0].days} Tage, Abdeckung ${Math.round(coverage * 100)} %` : `kein belastbarer Trend; Abdeckung ${Math.round(coverage * 100)} %` },
      alternatives: fm?.alternatives ?? [],
      missingData: missing,
      similarCases: [],
      nextCheck: fm?.check ?? "Keine Maßnahme nötig – Trend weiter beobachten.",
    },
  };
}
