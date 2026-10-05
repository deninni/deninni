import "server-only";
import { sampleMachine, type Snapshot } from "../demo/engine";
import { freshSample } from "../plc/edge-state";
import { MACHINES, type MachineId } from "../plants";
import { readStore } from "../store/store";
import { deriveAlerts, type Alert } from "../alerts";

/** Live-Snapshot: frisches Edge-Sample (≤ 15 s) überschreibt Demo-Werte; fehlende Signale füllt die Engine. */
export async function liveSnapshot(id: MachineId, now = Date.now()): Promise<Snapshot & { edgeAgent?: string; s7Verified?: boolean }> {
  const demo = sampleMachine(id, now);
  const edge = await freshSample(id, now);
  if (!edge) return demo;
  const sig = { ...demo.signals };
  for (const k of Object.keys(sig) as (keyof typeof sig)[]) {
    if (typeof edge.values[k] === "number") sig[k] = edge.values[k];
  }
  return { ...demo, signals: sig, source: edge.origin, edgeAgent: edge.agentId, s7Verified: edge.s7Verified };
}

export async function liveAll(now = Date.now()) {
  return Promise.all(MACHINES.map((m) => liveSnapshot(m.id, now)));
}

export async function currentAlerts(now = Date.now(), tenant = "demo"): Promise<Alert[]> {
  const s = await readStore(tenant);
  return deriveAlerts(s.alerts, now);
}
