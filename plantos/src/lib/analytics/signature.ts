import { BASE } from "../demo/engine";
import type { GraphNode } from "../graph/model";
import { assetSeries, assetAlarmCounts, profileOf } from "../assets/telemetry";
import { linreg, median, round } from "./stats";

/**
 * Zustands-Signatur eines Maschinen-Assets (für Cross-Plant-Vergleiche).
 * 7 normierte Merkmale aus Messwerten der letzten 7 Tage bis zum Zeitpunkt ts.
 */
export const SIGNATURE_FEATURES = ["Schwingungsniveau", "Schwingungstrend", "Temperaturniveau", "Temperaturtrend", "Stromniveau", "Ausschussniveau", "Alarmrate"] as const;

export function signatureAt(n: GraphNode, ts: number): number[] {
  const prof = profileOf(n);
  const b = BASE[prof];
  const pts = assetSeries(n, ts - 7 * 86_400_000, ts, 3_600_000).filter((p) => p.state !== "STOPPED");
  const day = (p: { ts: number }) => (p.ts - ts) / 86_400_000;
  const last24 = pts.filter((p) => p.ts > ts - 86_400_000);
  const vib = linreg(pts.map(day), pts.map((p) => p.signals.vibrationMmS));
  const temp = linreg(pts.map(day), pts.map((p) => p.signals.temperatureC));
  const alarms = Object.values(assetAlarmCounts(n, ts - 7 * 86_400_000, ts)).reduce((a, c) => a + c, 0);
  return [
    (median(last24.map((p) => p.signals.vibrationMmS)) - b.vib) / 2,
    vib.slope / 0.05,
    (median(last24.map((p) => p.signals.temperatureC)) - b.temp) / 10,
    temp.slope / 0.2,
    (median(last24.map((p) => p.signals.motorCurrentA)) - b.current) / 3,
    (median(last24.map((p) => p.signals.rejectRatePct)) - 0.8) / 1.5,
    alarms / 7 / 30,
  ].map((v) => round(Number.isFinite(v) ? v : 0, 3));
}
