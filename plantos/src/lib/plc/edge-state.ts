import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir, writeJsonAtomic } from "../store/store";
import { EDGE_FRESH_MS, freshness, type EdgeSample, type Freshness } from "./edge-protocol";
import { MACHINES } from "../plants";

interface EdgeState {
  samples: Record<string, EdgeSample>; // letzte pro Anlage
  heartbeats: Record<string, { agentId: string; at: number; machineIds: string[] }>;
}

let state: EdgeState | null = null;

function file() {
  return path.join(dataDir(), "edge", "state.json");
}

async function load(): Promise<EdgeState> {
  if (state) return state;
  try {
    state = JSON.parse(await fs.readFile(file(), "utf8")) as EdgeState;
  } catch {
    state = { samples: {}, heartbeats: {} };
  }
  return state;
}

export async function recordSample(s: EdgeSample) {
  const st = await load();
  st.samples[s.machineId] = s;
  await writeJsonAtomic(file(), st);
}

export async function recordHeartbeat(agentId: string, machineIds: string[], at = Date.now()) {
  const st = await load();
  st.heartbeats[agentId] = { agentId, at, machineIds };
  await writeJsonAtomic(file(), st);
}

export async function freshSample(machineId: string, now = Date.now()): Promise<EdgeSample | null> {
  const st = await load();
  const s = st.samples[machineId];
  return s && now - s.receivedAt <= EDGE_FRESH_MS ? s : null;
}

export interface EdgePlantStatus {
  machineId: string;
  code: string;
  name: string;
  freshness: Freshness;
  agentId: string | null;
  origin: string | null;
  ageS: number | null;
  tagCount: number;
}

export async function edgePlants(now = Date.now()): Promise<EdgePlantStatus[]> {
  const st = await load();
  return MACHINES.map((m) => {
    const s = st.samples[m.id] ?? null;
    const hb = Object.values(st.heartbeats).filter((h) => h.machineIds.includes(m.id)).sort((a, b) => b.at - a.at)[0] ?? null;
    return {
      machineId: m.id,
      code: m.code,
      name: m.name,
      freshness: freshness(s?.receivedAt ?? null, hb?.at ?? null, now),
      agentId: s?.agentId ?? hb?.agentId ?? null,
      origin: s?.origin ?? null,
      ageS: s ? Math.round((now - s.receivedAt) / 1000) : null,
      tagCount: s ? Object.keys(s.values).length : 0,
    };
  });
}
