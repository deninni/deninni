import "server-only";
import { readStore } from "../store/store";
import { currentAlerts, liveSnapshot } from "./data";
import { buildHandover } from "../handover/build";
import { MACHINES } from "../plants";

export async function collectHandover(user: string, machineId?: string) {
  const now = Date.now();
  const snaps = Object.fromEntries(await Promise.all(MACHINES.map(async (m) => [m.id, await liveSnapshot(m.id, now)] as const)));
  return buildHandover({ now, user, tickets: (await readStore()).tickets, alerts: await currentAlerts(now), machineId, snapshot: (id) => snaps[id] });
}
