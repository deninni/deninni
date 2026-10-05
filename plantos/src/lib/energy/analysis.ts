import type { GraphNode } from "../graph/model";
import { assetSeries, profileOf } from "../assets/telemetry";
import { linreg, mean, quantile, std, round, clamp } from "../analytics/stats";
import { confidenceLabel, type Explanation } from "../analytics/explain";

/**
 * Energieanalyse je Maschine aus Leistungswerten (kW, 5-min-Raster).
 * Einsparpotenziale sind Schätzungen mit ausgewiesenen Annahmen – keine realisierten Einsparungen.
 */
export interface EnergyAnalysis {
  assetId: string;
  code: string;
  days: number;
  source: "DEMO";
  totalKwh: number;
  kwhPerDay: number;
  goodUnits: number;
  kwhPerUnit: number | null;
  idleKwh: number;
  idleSharePct: number;
  peak15minKw: number;
  avgKw: number;
  sollKwhPerUnit: number | null;
  istVsSollPct: number | null;
  trendPerDayPct: number;
  unusualCurrent: { z: number; flagged: boolean; recentA: number; baselineA: number };
  daily: { day: string; kwh: number; kwhPerUnit: number | null }[];
  potentials: { title: string; kwhPerDay: number; costPerDay: number; costPerYear: number; recommendation: string; risk: string; assumption: string }[];
  explanation: Explanation;
}

const D = 86_400_000;

export function analyzeEnergy(n: GraphNode, pricePerKwh: number, now = Date.now(), days = 14): EnergyAnalysis {
  const step = 300_000;
  const h = step / 3_600_000;
  const pts = assetSeries(n, now - days * D, now, step);
  const prof = profileOf(n);
  let total = 0, idle = 0, good = 0;
  const dayMap = new Map<number, { kwh: number; units: number }>();
  for (const p of pts) {
    const kwh = p.signals.powerKw * h;
    total += kwh;
    if (p.state === "STOPPED") idle += kwh;
    good += p.signals.outputRate * 5;
    const d = Math.floor((p.ts - (now - days * D)) / D);
    const e = dayMap.get(d) ?? { kwh: 0, units: 0 };
    e.kwh += kwh; e.units += p.signals.outputRate * 5;
    dayMap.set(d, e);
  }
  let peak = 0;
  for (let i = 2; i < pts.length; i++) peak = Math.max(peak, (pts[i].signals.powerKw + pts[i - 1].signals.powerKw + pts[i - 2].signals.powerKw) / 3);

  // Soll = bestes Dezil (P10) der stündlichen spezifischen Energie der eigenen Historie
  const hourly: number[] = [];
  for (let i = 0; i + 12 <= pts.length; i += 12) {
    const blk = pts.slice(i, i + 12);
    const units = blk.reduce((a, p) => a + p.signals.outputRate * 5, 0);
    if (units > 0 && blk.every((p) => p.state !== "STOPPED")) hourly.push(blk.reduce((a, p) => a + p.signals.powerKw * h, 0) / units);
  }
  const ist = good > 0 ? total / good : null;
  const soll = hourly.length >= 24 ? quantile(hourly, 0.1) : null;

  const daily = [...dayMap.entries()].sort((a, b) => a[0] - b[0]).map(([d, e]) => ({ day: new Date(now - days * D + d * D).toISOString().slice(0, 10), kwh: round(e.kwh, 1), kwhPerUnit: e.units > 0 ? round(e.kwh / e.units, 5) : null }));
  const trendDays = daily.filter((d) => d.kwhPerUnit != null);
  const reg = linreg(trendDays.map((_, i) => i), trendDays.map((d) => d.kwhPerUnit!));
  const trendPct = ist ? (reg.slope / ist) * 100 : 0;

  const running = pts.filter((p) => p.state !== "STOPPED");
  const recent = running.filter((p) => p.ts > now - D).map((p) => p.signals.motorCurrentA);
  const base = running.filter((p) => p.ts <= now - D).map((p) => p.signals.motorCurrentA);
  const z = std(base) > 0 ? (mean(recent) - mean(base)) / (std(base) / Math.sqrt(Math.max(1, recent.length))) : 0;

  const kwhPerDay = total / days;
  const idlePerDay = idle / days;
  const potentials: EnergyAnalysis["potentials"] = [];
  const idleFraction = prof === "m-vl3" ? 0.6 : 0.3;
  if (idle / total > 0.01) {
    const k = idlePerDay * idleFraction;
    potentials.push({
      title: prof === "m-vl3" ? "Tunnel-Temperaturabsenkung im Stillstand" : "Nebenaggregate im Stillstand abschalten",
      kwhPerDay: round(k, 1), costPerDay: round(k * pricePerKwh, 2), costPerYear: round(k * pricePerKwh * 365, 0),
      recommendation: prof === "m-vl3" ? "Bei Stillständen > 10 min Tunnel auf Standby-Temperatur absenken (Bedienerentscheidung, keine automatische Umschaltung durch plantOS)." : "Vakuum-/Kühlaggregate bei Stillstand > 15 min in Standby (Freigabe Werkleitung).",
      risk: prof === "m-vl3" ? "Wiederaufheizzeit ca. 10–15 min (Annahme) – Anlauf und Folienqualität prüfen." : "Anlaufverzögerung wenige Minuten (Annahme).",
      assumption: `${Math.round(idleFraction * 100)} % des Stillstandsverbrauchs vermeidbar (DEMO-Annahme)`,
    });
  }
  if (ist && soll && ist > soll * 1.05) {
    const k = ((ist - soll) / ist) * kwhPerDay * 0.5;
    potentials.push({
      title: "Spezifischen Verbrauch an bestes Dezil annähern",
      kwhPerDay: round(k, 1), costPerDay: round(k * pricePerKwh, 2), costPerYear: round(k * pricePerKwh * 365, 0),
      recommendation: "Betriebspunkte mit niedrigem spezifischem Verbrauch (Stunden im besten Dezil) analysieren und als Standard prüfen.",
      risk: "Gering – Analyse, keine Parameteränderung durch plantOS.",
      assumption: "50 % der Abweichung zum besten Dezil erreichbar (DEMO-Annahme)",
    });
  }
  const conf = clamp((pts.length / (days * 288)) * (hourly.length >= 48 ? 1 : 0.6), 0, 1);
  return {
    assetId: n.id, code: n.code ?? n.name, days, source: "DEMO",
    totalKwh: round(total, 0), kwhPerDay: round(kwhPerDay, 1), goodUnits: Math.round(good), kwhPerUnit: ist ? round(ist, 5) : null,
    idleKwh: round(idle, 0), idleSharePct: round((idle / Math.max(1e-9, total)) * 100, 1), peak15minKw: round(peak, 1), avgKw: round(total / (days * 24), 1),
    sollKwhPerUnit: soll ? round(soll, 5) : null, istVsSollPct: ist && soll ? round((ist / soll - 1) * 100, 1) : null,
    trendPerDayPct: round(trendPct, 3),
    unusualCurrent: { z: round(z, 1), flagged: Math.abs(z) > 3, recentA: round(mean(recent), 2), baselineA: round(mean(base), 2) },
    daily, potentials,
    explanation: {
      method: "Integration der Wirkleistung (5-min-Raster), Soll = P10 der stündlichen kWh/Einheit, Trend = Regression der Tageswerte",
      usedData: [{ signal: "Wirkleistung", source: "DEMO-Engine (aus Strom berechnet)", samples: pts.length }, { signal: "Ausbringung", source: "DEMO-Engine", samples: pts.length }],
      period: { from: new Date(now - days * D).toISOString(), to: new Date(now).toISOString() },
      reasoning: [
        `Verbrauch ${round(kwhPerDay, 0)} kWh/Tag, davon ${round((idle / Math.max(1e-9, total)) * 100, 1)} % im Stillstand`,
        ist && soll ? `Ist ${round(ist * 1000, 2)} Wh/Einheit vs. Soll (bestes Dezil) ${round(soll * 1000, 2)} Wh/Einheit` : "Soll nicht bestimmbar (zu wenig Laufstunden)",
        `Trend spezifischer Verbrauch ${round(trendPct, 2)} %/Tag (R² ${round(reg.r2, 2)})`,
      ],
      confidence: { score: round(conf, 2), label: confidenceLabel(conf), why: `${pts.length} Messpunkte, ${hourly.length} volle Laufstunden` },
      alternatives: ["Messfehler Leistungsmessung", "geänderter Produktmix", "Umgebungstemperatur (Heizung/Kühlung)"],
      missingData: ["echter Energiezähler (Leistung hier aus Strom × 400 V × cos φ 0,85 berechnet)", "Druckluftverbrauch"],
      similarCases: [],
      nextCheck: potentials[0]?.recommendation ?? "Kein relevantes Potenzial erkannt.",
    },
  };
}
