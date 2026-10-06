import type { Snapshot } from "../demo/engine";
import { getMachine } from "../plants";

/**
 * Ursachenanalyse als Regelbaum (Heuristik). Kein ML, nicht zertifiziert.
 * Jede Hypothese nennt Evidenz aus Messwerten und konkrete Prüfschritte (ohne Eingriff in die SPS).
 */
export interface RcaHypothesis {
  code: string;
  title: string;
  confidence: "hoch" | "mittel" | "niedrig";
  evidence: string[];
  checks: string[];
  component: string;
}

export interface RcaResult {
  machineId: string;
  machineCode: string;
  at: string;
  method: "Regelbaum (Heuristik)";
  hypotheses: RcaHypothesis[];
  note: string;
}

const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

export function runRca(snap: Snapshot): RcaResult {
  const s = snap.signals;
  const m = getMachine(snap.machineId)!;
  const h: RcaHypothesis[] = [];

  if (snap.machineId === "m-af12") {
    if (s.temperatureC > 54 && s.motorCurrentA > 19.5) {
      h.push({
        code: "MOT-REIB", title: "Erhöhte Lagerreibung / Schmiermangel Hauptantrieb M-001", component: "m-001",
        confidence: s.vibrationMmS > 2.6 ? "hoch" : "mittel",
        evidence: [`Temperatur ${fmt(s.temperatureC)} °C (> 54)`, `Motorstrom ${fmt(s.motorCurrentA, 2)} A (> 19,5)`, `Vibration ${fmt(s.vibrationMmS, 2)} mm/s`],
        checks: ["Lagertemperatur mit Handmessgerät gegenprüfen", "Schmierplan M-001 prüfen", "Lüfterhaube auf Verschmutzung prüfen"],
      });
    } else if (s.temperatureC > 54) {
      h.push({
        code: "MOT-KUEHL", title: "Kühlung Hauptantrieb unzureichend", component: "m-001", confidence: "niedrig",
        evidence: [`Temperatur ${fmt(s.temperatureC)} °C bei normalem Strom`],
        checks: ["Umgebungstemperatur / Hallenlüftung prüfen", "Lüfterrad M-001 Sichtprüfung"],
      });
    }
    if (s.rejectRatePct > 2.8) {
      h.push({
        code: "TIP-SR03", title: "Flaschen kippen am Sternrad SR-03 (Übergabe Füller → Verschließer)", component: "sr-03",
        confidence: s.vibrationMmS > 2.8 ? "hoch" : "mittel",
        evidence: [`Ausschuss ${fmt(s.rejectRatePct, 2)} % (> 2,8)`, `Vibration ${fmt(s.vibrationMmS, 2)} mm/s`],
        checks: ["Führungsgeländer SR-03 auf Formatteile 1,0 L prüfen", "Sternradtaschen auf Verschleiß prüfen", "Geschwindigkeit in Simulation gegen Format prüfen"],
      });
    }
  }
  if (snap.machineId === "m-vl3" && s.temperatureC > 60) {
    h.push({
      code: "TUN-REGL", title: "Shrink-Tunnel: Temperaturregelung überschwingt", component: "vl-tunnel",
      confidence: s.rejectRatePct > 1.5 ? "hoch" : "mittel",
      evidence: [`Tunneltemperatur ${fmt(s.temperatureC)} °C (> 60)`, `Ausschuss ${fmt(s.rejectRatePct, 2)} %`],
      checks: ["PT100-Fühler auf Sitz und Stecker prüfen", "Heizregister-Schütze Sichtprüfung (spannungsfrei!)", "Folienqualität / Charge prüfen"],
    });
  }
  if (snap.machineId === "m-ft7") {
    if (s.motorCurrentA > 11) {
      h.push({
        code: "MOT-BLOCK", title: "Antrieb A3 schwergängig / mechanische Blockade Segment B", component: "ft-m-b",
        confidence: s.vibrationMmS > 4 ? "hoch" : "mittel",
        evidence: [`Motorstrom ${fmt(s.motorCurrentA, 2)} A (> 11)`, `Vibration ${fmt(s.vibrationMmS, 2)} mm/s`, `Geschwindigkeit ${fmt(s.speedPercent)} %`],
        checks: ["Bandlauf Segment B auf Fremdkörper prüfen", "Getriebeöl Antrieb A3 prüfen", "Kupplung auf Spiel prüfen"],
      });
    }
    if (s.speedPercent < 60 && s.rejectRatePct > 1.5) {
      h.push({
        code: "SRT-STAU", title: "Stau im Sorter (Segment B)", component: "ft-seg-b", confidence: "mittel",
        evidence: [`Geschwindigkeit ${fmt(s.speedPercent)} %`, `Ausschuss ${fmt(s.rejectRatePct, 2)} %`],
        checks: ["Lichtschranken LS-1/LS-2 reinigen", "Sorterweiche auf Gängigkeit prüfen"],
      });
    }
  }
  if (s.vibrationMmS > 4.5 && !h.some((x) => x.code === "MOT-BLOCK")) {
    h.push({
      code: "VIB-ALLG", title: "Allgemein erhöhte Schwingung", component: "", confidence: "niedrig",
      evidence: [`Vibration ${fmt(s.vibrationMmS, 2)} mm/s (> 4,5, ISO 10816 Zone C)`],
      checks: ["Befestigungsschrauben prüfen", "Unwucht / Ausrichtung prüfen"],
    });
  }

  // Aktive Meldung ohne passende Regel (z. B. Anfang eines Vorfalls, Werte noch unter Schwelle):
  // ehrlich als niedrige Konfidenz ausweisen statt „keine Auffälligkeit“ zu behaupten.
  const inc = snap.activeIncident;
  if (inc && !h.some((x) => x.component === inc.component)) {
    h.push({
      code: inc.code, title: inc.title, component: inc.component, confidence: "niedrig",
      evidence: [`Meldung ${inc.code} aktiv (${inc.severity})`, "Messwerte noch unter Regel-Schwellen – Trend beobachten"],
      checks: ["Komponente vor Ort sichten, bevor Hardware angefasst wird", "Verlauf in Historie prüfen (letzte 30 min)"],
    });
  }

  return {
    machineId: snap.machineId,
    machineCode: m.code,
    at: new Date(snap.ts).toISOString(),
    method: "Regelbaum (Heuristik)",
    hypotheses: h,
    note: h.length ? "Prüfschritte ohne Eingriff in die SPS. Keine Abschaltung, kein Sollwert durch plantOS." : "Keine Auffälligkeit nach Regelbaum. Messwerte im Normalband.",
  };
}

export function rcaTicketTitle(machineCode: string, hyp: RcaHypothesis): string {
  return `[RCA] ${hyp.code} · ${machineCode} · ${hyp.title}`;
}
