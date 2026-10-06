import type { Snapshot } from "../demo/engine";
import { LAYOUTS, type TwinNode } from "./layouts";
import { computePhysics } from "./physics";
import type { MachineId } from "../plants";

export type Health = "OK" | "WARN" | "FAULT" | "OFF";

export interface TwinComponent extends TwinNode {
  health: Health;
}

export interface TwinPayload {
  machineId: MachineId;
  state: Snapshot["state"];
  source: Snapshot["source"];
  ts: number;
  speedPercent: number;
  tipRiskPct: number;
  bottleFormat: string;
  predictedTempC: number;
  components: TwinComponent[];
  flow: string[];
  incident: { code: string; title: string; component: string } | null;
}

export function buildTwin(snap: Snapshot, opts: { speedFactor?: number; bottleFormat?: string } = {}): TwinPayload {
  const layout = LAYOUTS[snap.machineId];
  const fmt = opts.bottleFormat ?? "1.0";
  const speed = snap.signals.speedPercent * (opts.speedFactor ?? 1);
  const phys = computePhysics(speed, fmt);
  const inc = snap.activeIncident;
  const stopped = snap.state === "STOPPED";

  const components = layout.nodes.map((n): TwinComponent => {
    let health: Health = stopped ? "OFF" : "OK";
    if (!stopped && inc && inc.component === n.id) health = inc.severity;
    if (!stopped && snap.machineId === "m-af12" && n.kind === "starwheel" && phys.tipRiskPct > 45) health = "WARN";
    if (n.kind === "safety") health = "OK";
    return { ...n, health };
  });

  return {
    machineId: snap.machineId,
    state: snap.state,
    source: snap.source,
    ts: snap.ts,
    speedPercent: Math.round(speed * 10) / 10,
    tipRiskPct: snap.machineId === "m-af12" ? phys.tipRiskPct : Math.round(phys.tipRiskPct * 0.6),
    bottleFormat: fmt,
    predictedTempC: snap.signals.temperatureC,
    components,
    flow: layout.flow,
    incident: inc ? { code: inc.code, title: inc.title, component: inc.component } : null,
  };
}
