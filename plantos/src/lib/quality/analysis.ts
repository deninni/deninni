import type { GraphNode } from "../graph/model";
import { assetSeries, profileOf } from "../assets/telemetry";
import { productAt, shiftAt } from "../demo/engine";
import { MAX_LINE_SPEED_MS } from "../twin/physics";
import { mean, quantile, welch, clamp, round } from "../analytics/stats";
import { confidenceLabel, type Explanation } from "../analytics/explain";

/**
 * Quality AI: Korrelationen zwischen Ausschuss und Prozess-/Bedienparametern.
 * Methode: Schwellwert-Splits (Dezile) mit Welch-Test, Kombination der zwei stärksten Regeln,
 * Gruppenvergleich für Produkt/Schicht. Korrelation ≠ Kausalität. Keine automatische Prozessänderung.
 */
interface Row { ts: number; speedMs: number; pressureBar: number; temperatureC: number; vibrationMmS: number; product: string; shift: string; reject: number; units: number }

const PARAMS = [
  { key: "speedMs", label: "Bandgeschwindigkeit", unit: "m/s", d: 2 },
  { key: "pressureBar", label: "Druck", unit: "bar", d: 2 },
  { key: "temperatureC", label: "Temperatur", unit: "°C", d: 1 },
  { key: "vibrationMmS", label: "Schwingung", unit: "mm/s", d: 2 },
] as const;
type PKey = (typeof PARAMS)[number]["key"];

export interface Rule { key: PKey; label: string; unit: string; op: ">" | "<"; threshold: number; d: number }

export interface Finding {
  kind: "single" | "combined" | "category";
  text: string;
  rules: Rule[];
  category?: { dimension: "Produkt" | "Schicht"; value: string };
  rejectInPct: number;
  rejectOutPct: number;
  deltaPctPoints: number;
  nIn: number;
  nOut: number;
  pValue: number;
  confidence: number;
  confidenceLabel: "hoch" | "mittel" | "niedrig";
  possibleCause: string;
  recommendedRange: string;
  impactPerDay: { scrapUnits: number; cost: number };
}

export interface QualityAnalysis {
  assetId: string;
  code: string;
  hours: number;
  samples: number;
  source: "DEMO";
  baselineRejectPct: number;
  findings: Finding[];
  note: string;
  explanation: Explanation;
}

const fmt = (v: number, d: number) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

function ruleText(r: Rule) { return `${r.label} ${r.op} ${fmt(r.threshold, r.d)} ${r.unit}`; }
function inverse(r: Rule) { return `${r.label} ${r.op === ">" ? "≤" : "≥"} ${fmt(r.threshold, r.d)} ${r.unit}`; }

const CAUSE: Record<PKey, string> = {
  speedMs: "Höhere Bandgeschwindigkeit erhöht Fliehkräfte an Sternrädern/Übergaben (Kippen, Fehlfüllung).",
  pressureBar: "Zu niedriger Fülldruck führt zu Schaumbildung bzw. Unterfüllung.",
  temperatureC: "Temperaturabweichung beeinflusst Viskosität/Folienschrumpf.",
  vibrationMmS: "Erhöhte Schwingung deutet auf mechanische Unruhe an Übergaben hin.",
};

export function analyzeQuality(n: GraphNode, scrapCostPerUnit: number, now = Date.now(), hours = 72): QualityAnalysis {
  const prof = profileOf(n);
  const pts = assetSeries(n, now - hours * 3_600_000, now, 300_000).filter((p) => p.state !== "STOPPED");
  const speedFactor = prof === "m-af12" ? MAX_LINE_SPEED_MS : 0.9;
  const rows: Row[] = pts.map((p) => ({
    ts: p.ts, speedMs: (speedFactor * p.signals.speedPercent) / 100, pressureBar: p.signals.pressureBar, temperatureC: p.signals.temperatureC,
    vibrationMmS: p.signals.vibrationMmS, product: productAt(prof, p.ts), shift: shiftAt(p.ts), reject: p.signals.rejectRatePct, units: p.signals.outputRate * 5,
  }));
  const base = mean(rows.map((r) => r.reject));
  const unitsPerDay = rows.reduce((a, r) => a + r.units, 0) / (hours / 24);
  const conf = (p: number, nIn: number) => clamp(Math.min(1, -Math.log10(Math.max(p, 1e-300)) / 12) * Math.min(1, nIn / 60), 0, 0.95);

  const make = (kind: Finding["kind"], rules: Rule[], sel: (r: Row) => boolean, cat?: Finding["category"]): Finding | null => {
    const a = rows.filter(sel).map((r) => r.reject), b = rows.filter((r) => !sel(r)).map((r) => r.reject);
    if (a.length < 20 || b.length < 20) return null;
    const w = welch(a, b);
    const share = a.length / rows.length;
    const extra = (w.diff / 100) * unitsPerDay * share;
    const c = conf(w.p, a.length);
    const text = cat ? `Ausschuss ist bei ${cat.dimension} „${cat.value}“ um ${fmt(w.diff, 2)} %-Pkt. höher.` : `Ausschuss steigt bei ${rules.map(ruleText).join(" und ")} (+${fmt(w.diff, 2)} %-Pkt.).`;
    return {
      kind, text, rules, category: cat,
      rejectInPct: round(mean(a), 2), rejectOutPct: round(mean(b), 2), deltaPctPoints: round(w.diff, 2), nIn: a.length, nOut: b.length, pValue: w.p,
      confidence: round(c, 2), confidenceLabel: confidenceLabel(c),
      possibleCause: cat ? (cat.dimension === "Produkt" ? "Formatabhängige Einstellungen (Führungen, Füllhöhe) prüfen." : "Bedienunterschiede zwischen Schichten (Einstellpraxis, Reinigung) prüfen.") : rules.map((r) => CAUSE[r.key]).join(" "),
      recommendedRange: cat ? `Einstellungen für ${cat.value} mit den übrigen ${cat.dimension === "Produkt" ? "Formaten" : "Schichten"} vergleichen` : `${rules.map(inverse).join(" oder ")} (Empfehlung zur Prüfung, keine automatische Änderung)`,
      impactPerDay: { scrapUnits: Math.round(Math.max(0, extra)), cost: round(Math.max(0, extra) * scrapCostPerUnit, 2) },
    };
  };

  const singles: Finding[] = [];
  for (const p of PARAMS) {
    if (p.key === "pressureBar" && prof !== "m-af12") continue;
    const vals = rows.map((r) => r[p.key]);
    let best: Finding | null = null;
    for (let q = 0.1; q <= 0.91; q += 0.1) {
      const t = round(quantile(vals, q), p.d);
      for (const op of [">", "<"] as const) {
        const rule: Rule = { key: p.key, label: p.label, unit: p.unit, op, threshold: t, d: p.d };
        const f = make("single", [rule], (r) => (op === ">" ? r[p.key] > t : r[p.key] < t));
        if (f && f.deltaPctPoints > 0 && f.pValue < 1e-4 && (!best || f.deltaPctPoints * Math.sqrt(f.nIn) > best.deltaPctPoints * Math.sqrt(best.nIn))) best = f;
      }
    }
    if (best) singles.push(best);
  }
  singles.sort((a, b) => b.deltaPctPoints - a.deltaPctPoints);

  const findings: Finding[] = [];
  // Alle Paare der Einzelregeln testen; Kombination nur, wenn sie stärker ist als jede ihrer Einzelregeln
  const test = (r: Row, x: Rule) => (x.op === ">" ? r[x.key] > x.threshold : r[x.key] < x.threshold);
  let bestCombo: Finding | null = null;
  for (let i = 0; i < singles.length; i++) {
    for (let j = i + 1; j < singles.length; j++) {
      const [r1, r2] = [singles[i].rules[0], singles[j].rules[0]];
      const combo = make("combined", [r1, r2], (r) => test(r, r1) && test(r, r2));
      if (!combo || combo.pValue >= 1e-4) continue;
      if (combo.deltaPctPoints <= Math.max(singles[i].deltaPctPoints, singles[j].deltaPctPoints) * 1.2) continue;
      if (!bestCombo || combo.deltaPctPoints * Math.sqrt(combo.nIn) > bestCombo.deltaPctPoints * Math.sqrt(bestCombo.nIn)) bestCombo = combo;
    }
  }
  if (bestCombo) findings.push(bestCombo);
  findings.push(...singles.slice(0, 3));
  for (const dim of ["Produkt", "Schicht"] as const) {
    const key = dim === "Produkt" ? "product" : "shift";
    const groups = [...new Set(rows.map((r) => r[key]))];
    let best: Finding | null = null;
    for (const g of groups) {
      const f = make("category", [], (r) => r[key] === g, { dimension: dim, value: dim === "Produkt" && prof === "m-af12" ? `${g.replace(".", ",")} L` : g });
      if (f && f.deltaPctPoints > 0.1 && f.pValue < 1e-3 && (!best || f.deltaPctPoints > best.deltaPctPoints)) best = f;
    }
    if (best) findings.push(best);
  }

  return {
    assetId: n.id, code: n.code ?? n.name, hours, samples: rows.length, source: "DEMO", baselineRejectPct: round(base, 2), findings,
    note: "Korrelation ist keine Kausalität. plantOS ändert keine Prozessparameter – Empfehlungen gehen an Bediener/Technologie zur Prüfung.",
    explanation: {
      method: "Dezil-Schwellen je Parameter mit Welch-t-Test (p < 0,0001), UND-Kombination der zwei stärksten Regeln, Gruppenvergleich Produkt/Schicht",
      usedData: [
        { signal: "Ausschussrate", source: "DEMO-Engine", samples: rows.length },
        { signal: "Bandgeschwindigkeit (aus Geschwindigkeit %)", source: "DEMO-Engine", samples: rows.length },
        { signal: "Druck", source: prof === "m-af12" ? "DEMO-Engine" : "nicht ausgewertet", samples: prof === "m-af12" ? rows.length : 0 },
        { signal: "Produkt (Produktionsplan) / Schicht", source: "DEMO-Plan", samples: rows.length },
      ],
      period: { from: new Date(now - hours * 3_600_000).toISOString(), to: new Date(now).toISOString() },
      reasoning: findings.length ? findings.map((f) => `${f.text} n=${f.nIn}, p=${f.pValue.toExponential(1)}`) : ["Keine signifikante Korrelation gefunden."],
      confidence: { score: findings[0]?.confidence ?? 0, label: findings[0]?.confidenceLabel ?? "niedrig", why: findings[0] ? `p=${findings[0].pValue.toExponential(1)}, n=${findings[0].nIn}` : "keine signifikanten Befunde" },
      alternatives: ["Störgröße nicht erfasst (Rohstoffcharge, Umgebung)", "zeitliche Kopplung mit Formatwechsel", "Messfehler Ausschusszählung"],
      missingData: ["Rezeptparameter (nur Format bekannt)", "Bediener-Eingriffe (HMI-Log)", "Rohstoff-/Chargendaten"],
      similarCases: [],
      nextCheck: findings[0] ? `Gezielter Versuch in der Schicht: ${findings[0].recommendedRange}` : "Weiter beobachten.",
    },
  };
}
