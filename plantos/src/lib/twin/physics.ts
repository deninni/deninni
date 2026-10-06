/**
 * Flaschen-Kipprisiko (DEMO-Heuristik, keine zertifizierte Berechnung).
 * Am Sternrad wirkt die Zentripetalbeschleunigung a = v²/r auf den Schwerpunkt der Flasche.
 * Kippen, wenn a · h_s > g · (d/2). TipRisk = Verhältnis in Prozent (gedeckelt 0–100).
 */
export interface BottleFormat {
  id: string;
  label: string;
  volumeL: number;
  heightM: number;
  diameterM: number;
  massKg: number;
  comHeightRatio: number; // Schwerpunkt-Höhe relativ zur Flaschenhöhe (gefüllt)
}

export const BOTTLE_FORMATS: BottleFormat[] = [
  { id: "0.5", label: "0,5 L", volumeL: 0.5, heightM: 0.205, diameterM: 0.065, massKg: 0.52, comHeightRatio: 0.42 },
  { id: "1.0", label: "1,0 L", volumeL: 1.0, heightM: 0.285, diameterM: 0.08, massKg: 1.03, comHeightRatio: 0.43 },
  { id: "1.25", label: "1,25 L", volumeL: 1.25, heightM: 0.31, diameterM: 0.084, massKg: 1.29, comHeightRatio: 0.44 },
  { id: "1.5", label: "1,5 L", volumeL: 1.5, heightM: 0.335, diameterM: 0.088, massKg: 1.54, comHeightRatio: 0.45 },
];

export function getFormat(id: string): BottleFormat {
  return BOTTLE_FORMATS.find((f) => f.id === id) ?? BOTTLE_FORMATS[1];
}

const G = 9.81;
const STAR_RADIUS_M = 0.36;
export const MAX_LINE_SPEED_MS = 1.45; // bei 100 %
/** Annahme: Führungsgeländer am Sternrad nimmt ~81 % des Kippmoments auf (DEMO-Kalibrierung). */
const GUIDE_RESIDUAL = 0.185;

export interface PhysicsResult {
  speedPercent: number;
  format: BottleFormat;
  lineSpeedMs: number;
  centripetalMs2: number;
  tipRiskPct: number;
  massFlowKgMin: number;
  bottlesPerMin: number;
  verdict: "unkritisch" | "beobachten" | "kritisch";
}

export function computePhysics(speedPercent: number, formatId: string, nominalBottlesPerMin = 600): PhysicsResult {
  const f = getFormat(formatId);
  const sp = Math.max(0, Math.min(120, speedPercent));
  const v = (MAX_LINE_SPEED_MS * sp) / 100;
  const a = (v * v) / STAR_RADIUS_M;
  const h = f.heightM * f.comHeightRatio;
  const ratio = ((a * h) / (G * (f.diameterM / 2))) * GUIDE_RESIDUAL;
  // Formatabhängige Leistung: größere Flaschen → weniger Fl/min
  const bpm = (nominalBottlesPerMin * sp) / 100 * (0.08 / f.diameterM) ** 1.2;
  const tip = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return {
    speedPercent: sp,
    format: f,
    lineSpeedMs: round(v, 3),
    centripetalMs2: round(a, 2),
    tipRiskPct: tip,
    massFlowKgMin: round(bpm * f.massKg, 1),
    bottlesPerMin: Math.round(bpm),
    verdict: tip > 45 ? "kritisch" : tip > 25 ? "beobachten" : "unkritisch",
  };
}

/** Höchste Geschwindigkeit (%) mit TipRisk ≤ limit. */
export function maxSafeSpeed(formatId: string, limitPct = 25): number {
  for (let s = 120; s >= 0; s--) if (computePhysics(s, formatId).tipRiskPct <= limitPct) return s;
  return 0;
}

function round(v: number, d: number) {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}
