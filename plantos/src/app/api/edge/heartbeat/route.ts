import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/plc/edge-state";
import { isMachineId } from "@/lib/plants";
import { edgeAuthorizedRequest } from "@/lib/server/edge-auth";

export async function POST(req: Request) {
  if (!(await edgeAuthorizedRequest(req))) return NextResponse.json({ error: "Edge-Token oder Session erforderlich" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { agentId?: string; machineIds?: string[] };
  const ids = (b.machineIds ?? []).filter(isMachineId);
  if (!b.agentId) return NextResponse.json({ error: "agentId fehlt" }, { status: 400 });
  await recordHeartbeat(String(b.agentId).slice(0, 64), ids);
  // Hinweis: Heartbeat-„origin“ wird bewusst NICHT als Datenherkunft gewertet.
  return NextResponse.json({ ok: true });
}
