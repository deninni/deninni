import { series, type Snapshot } from "../demo/engine";
import type { MachineId } from "../plants";

export interface AnomalyWindow {
  signal: keyof Snapshot["signals"];
  from: number;
  to: number;
  peak: number;
  z: number;
}

/** Heuristik: z-Score gegen das Fenster-Median/MAD; zusammenhängende Ausreißer → Fenster. */
export function detectAnomalies(machineId: MachineId, fromTs: number, toTs: number, stepMs = 60_000): { points: Snapshot[]; windows: AnomalyWindow[] } {
  const points = series(machineId, fromTs, toTs, stepMs);
  const signals: (keyof Snapshot["signals"])[] = ["temperatureC", "motorCurrentA", "vibrationMmS", "rejectRatePct"];
  const windows: AnomalyWindow[] = [];
  for (const sig of signals) {
    const vals = points.filter((p) => p.state !== "STOPPED").map((p) => p.signals[sig]);
    if (vals.length < 10) continue;
    const med = median(vals);
    const mad = median(vals.map((v) => Math.abs(v - med))) * 1.4826 || 1e-6;
    let open: AnomalyWindow | null = null;
    for (const p of points) {
      const z = p.state === "STOPPED" ? 0 : (p.signals[sig] - med) / mad;
      if (z > 3.5) {
        if (!open) open = { signal: sig, from: p.ts, to: p.ts, peak: p.signals[sig], z };
        open.to = p.ts;
        if (p.signals[sig] > open.peak) { open.peak = p.signals[sig]; open.z = z; }
      } else if (open) {
        windows.push(open);
        open = null;
      }
    }
    if (open) windows.push(open);
  }
  return { points, windows: windows.sort((a, b) => b.from - a.from) };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
