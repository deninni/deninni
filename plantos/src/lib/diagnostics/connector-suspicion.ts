/**
 * Steckverbinder-Verdacht (TT-214).
 * Oxidation verändert die Signalqualität (Rauschen, Aussetzer, Pegel, eingefrorene Werte, Busfehler).
 * Laufzeit/Latenz/Ausbreitungsgeschwindigkeit sind KEIN Kriterium und werden ignoriert.
 */

export const SIGNALARTEN = ["analog_v", "analog_ma", "widerstand", "frequenz_pwm", "hall", "induktiv", "iolink", "can", "modbus", "ethernet"] as const;
export type Signalart = (typeof SIGNALARTEN)[number];

export interface SuspicionInput {
  sensor_id?: string;
  anlage?: string;
  ort?: string;
  signalart?: string;
  zeitreihe?: { wert: number; zeitstempel: string }[];
  baseline?: { tage: number; rauschen_std: number; aussetzer_24h?: number };
  aussetzer_24h?: number;
  eingefroren_faktor_haltezeit?: number;
  prozess_laeuft?: boolean;
  offset_dauer_min?: number;
  offset_trend_7d?: boolean;
  versorgung_pct?: number;
  bus?: { crc_steigend?: boolean; retransmits_steigend?: boolean; lost_frames_steigend?: boolean; jitter_faktor?: number };
  score_trend_7d?: boolean;
  anstiegszeit_faktor?: number;
  anregung_bekannt?: boolean;
  vergleichssensor?: { gleiche_abweichung: boolean };
  laufzeit_ms?: number;
  latenz_ms?: number;
  ausbreitung_m_s?: number;
}

export type Stufe = "ok" | "beobachten" | "verdacht" | "dringend";

export interface SuspicionResult {
  ok: true;
  sensor_id: string;
  score: number;
  stufe: Stufe;
  gruende: { text: string; punkte: number }[];
  nachricht: string;
  naechsterSchritt: string;
  ignoriert: string[];
  limits: { keinShutdown: true; keineSollwertaenderung: true; keinAuftragOhneFreigabe: true };
  hinweis: string;
  grenze: string;
}

export interface SuspicionError {
  ok: false;
  code: "EINGABE_UNVOLLSTAENDIG";
  nachricht: string;
  fehlend: string[];
}

export const NEXT_STEP =
  "Stecker prüfen, bevor der Sensor getauscht wird. Sichtprüfung, nachstecken, Kontakt unter Last messen. Ein Sensortausch behebt keinen Kontaktfehler.";
export const LIMIT_TEXT =
  "plantOS meldet nur. Keine Abschaltung, keine Sollwertänderung, kein Auftrag ohne Freigabe.";
export const HINT =
  "Heuristik auf Signalqualität. Laufzeit, Latenz und Ausbreitungsgeschwindigkeit sind kein Kriterium für Oxidation.";

const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function assessConnector(input: SuspicionInput): SuspicionResult | SuspicionError {
  const fehlend: string[] = [];
  if (!input.sensor_id) fehlend.push("sensor_id");
  if (!input.anlage) fehlend.push("anlage");
  if (!input.ort) fehlend.push("ort");
  if (!input.signalart || !SIGNALARTEN.includes(input.signalart as Signalart)) fehlend.push("signalart");
  if (!Array.isArray(input.zeitreihe) || !input.zeitreihe.length) fehlend.push("zeitreihe");
  if (fehlend.length) {
    return { ok: false, code: "EINGABE_UNVOLLSTAENDIG", nachricht: `Eingabe unvollständig. Fehlende Felder: ${fehlend.join(", ")}`, fehlend };
  }

  const id = input.sensor_id!;
  const werte = input.zeitreihe!.map((p) => p.wert).filter((v) => Number.isFinite(v));
  const gruende: { text: string; punkte: number; kind: string }[] = [];
  const hasBaseline = !!input.baseline && input.baseline.tage >= 7 && input.baseline.tage <= 30 && input.baseline.rauschen_std > 0;

  // Rauschen (nur mit Baseline)
  if (hasBaseline) {
    const ratio = std(werte) / input.baseline!.rauschen_std;
    if (ratio > 3) gruende.push({ text: `Rauschen ${fmt(ratio)}×`, punkte: 40, kind: "rauschen" });
    else if (ratio > 1.8) gruende.push({ text: `Rauschen ${fmt(ratio)}×`, punkte: 25, kind: "rauschen" });
  }
  // Aussetzer
  const aus = input.aussetzer_24h ?? 0;
  if (aus >= 15) gruende.push({ text: `${aus} Aussetzer/24 h`, punkte: 35, kind: "aussetzer" });
  else if (aus >= 5) gruende.push({ text: `${aus} Aussetzer/24 h`, punkte: 20, kind: "aussetzer" });
  // Bereich / Versorgung
  const outOfRange = input.signalart === "analog_ma" && werte.some((v) => v < 3.8 || v > 20.5);
  const supplyDip = input.versorgung_pct != null && input.versorgung_pct < 90;
  if (outOfRange || supplyDip) gruende.push({ text: outOfRange ? "4–20 mA außerhalb 3,8–20,5" : "Versorgungseinbruch", punkte: 30, kind: "bereich" });

  if (hasBaseline) {
    if ((input.eingefroren_faktor_haltezeit ?? 0) > 10 && input.prozess_laeuft) gruende.push({ text: "Wert eingefroren bei laufendem Prozess", punkte: 25, kind: "frozen" });
    if ((input.offset_dauer_min ?? 0) > 30) gruende.push({ text: "Offset > 30 min", punkte: 20, kind: "offset" });
    if (input.offset_trend_7d) gruende.push({ text: "Offset-Trend 7 Tage", punkte: 15, kind: "offset-trend" });
    const bus = input.bus;
    if (bus && (bus.crc_steigend || bus.retransmits_steigend || bus.lost_frames_steigend || (bus.jitter_faktor ?? 0) > 2)) {
      gruende.push({ text: "Busfehler steigend", punkte: 30, kind: "bus" });
    }
    if (input.score_trend_7d) gruende.push({ text: "Score-Trend 7 Tage", punkte: 10, kind: "trend" });
    if ((input.anstiegszeit_faktor ?? 0) > 2 && input.anregung_bekannt) gruende.push({ text: "Anstiegszeit > 2×", punkte: 15, kind: "anstieg" });
  }

  let score = gruende.reduce((s, g) => s + g.punkte, 0);
  let vergleichText: string | null = null;
  if (input.vergleichssensor) {
    if (input.vergleichssensor.gleiche_abweichung) {
      score -= 20;
      vergleichText = "Vergleichssensor gleiche Abweichung (−20)";
    } else {
      vergleichText = "Vergleichssensor stabil";
    }
  }

  // Deckel
  const total = werte.length === 0 || (aus >= 15 && werte.every((v) => v === 0));
  if (!hasBaseline) score = Math.min(score, 39);
  const realKinds = new Set(gruende.map((g) => g.kind));
  if (realKinds.size <= 1) score = Math.min(score, 39);
  // Anstiegszeit darf Stufe nicht allein heben
  if (realKinds.has("anstieg")) {
    const without = score - 15;
    if (stufeOf(without) !== stufeOf(score)) score = without;
  }
  if (hasBaseline && total) score = Math.max(score, 40);
  score = Math.max(0, Math.round(score));

  const stufe = stufeOf(score);
  const sorted = [...gruende].sort((a, b) => b.punkte - a.punkte);
  const top = sorted.slice(0, vergleichText ? 2 : 3).map((g) => g.text);
  if (vergleichText) top.push(vergleichText);

  let nachricht: string;
  if (stufe === "verdacht" || stufe === "dringend") {
    nachricht = `Sensor ${id}: Signalqualität auffällig (${top.join(", ")}). Verdacht Steckverbindung oxidiert/korrodiert oder Sensor defekt. Stecker prüfen, bevor der Sensor getauscht wird.`;
  } else if (stufe === "beobachten") {
    nachricht = `Sensor ${id}: Signalqualität beobachten (${top.join(", ")}). Stufe beobachten (${sorted[0]?.text ?? "Einzelmerkmal"}). Stecker prüfen, bevor der Sensor getauscht wird.`;
  } else {
    nachricht = `Sensor ${id}: Signalqualität unauffällig. Kein Verdacht auf oxidierte Steckverbindung.`;
  }

  const ignoriert: string[] = [];
  if (input.laufzeit_ms != null) ignoriert.push("laufzeit_ms");
  if (input.latenz_ms != null) ignoriert.push("latenz_ms");
  if (input.ausbreitung_m_s != null) ignoriert.push("ausbreitung_m_s");

  return {
    ok: true,
    sensor_id: id,
    score,
    stufe,
    gruende: sorted.map(({ text, punkte }) => ({ text, punkte })),
    nachricht,
    naechsterSchritt: NEXT_STEP,
    ignoriert,
    limits: { keinShutdown: true, keineSollwertaenderung: true, keinAuftragOhneFreigabe: true },
    hinweis: HINT,
    grenze: LIMIT_TEXT,
  };
}

function stufeOf(score: number): Stufe {
  if (score <= 0) return "ok";
  if (score < 40) return "beobachten";
  if (score < 70) return "verdacht";
  return "dringend";
}

/** DEMO-Fixture TT-214 (keine Live-SPS). */
export function tt214ExampleInput(): SuspicionInput {
  const zeitreihe: { wert: number; zeitstempel: string }[] = [];
  const base = Date.UTC(2026, 9, 5, 4, 0, 0);
  for (let i = 0; i < 60; i++) {
    // deterministisch 12 ± 2,4 (std ≈ 2,4 ⇒ 2,4× gegenüber Baseline 1,0)
    const v = 12 + 2.4 * Math.sqrt(2) * Math.sin(i * 1.7);
    zeitreihe.push({ wert: Math.round(v * 100) / 100, zeitstempel: new Date(base + i * 60_000).toISOString() });
  }
  return {
    sensor_id: "TT-214",
    anlage: "AF-12",
    ort: "Füller, Messstelle Produkt (DEMO)",
    signalart: "analog_ma",
    zeitreihe,
    baseline: { tage: 14, rauschen_std: 1.0 },
    aussetzer_24h: 9,
    vergleichssensor: { gleiche_abweichung: false },
    laufzeit_ms: 3.2,
  };
}
