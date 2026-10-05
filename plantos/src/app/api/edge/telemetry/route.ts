import { NextResponse } from "next/server";
import { guardTelemetry } from "@/lib/plc/tag-write-guard";
import { enforceS7EdgeHonesty } from "@/lib/plc/edge-protocol";
import { recordSample } from "@/lib/plc/edge-state";
import { isMachineId } from "@/lib/plants";
import { edgeAuthorizedRequest } from "@/lib/server/edge-auth";

export async function POST(req: Request) {
  if (!(await edgeAuthorizedRequest(req))) return NextResponse.json({ error: "Edge-Token oder Session erforderlich" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const guard = guardTelemetry(body);
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 400 });
  const b = body as { machineId?: string; agentId?: string; origin?: string; values?: Record<string, number>; addresses?: Record<string, string>; readProof?: string; note?: string; ts?: number };
  if (!b.machineId || !isMachineId(b.machineId)) return NextResponse.json({ error: "machineId unbekannt" }, { status: 400 });
  const h = enforceS7EdgeHonesty(b);
  if (!h.ok) return NextResponse.json({ error: h.error }, { status: 400 });
  const now = Date.now();
  await recordSample({
    machineId: b.machineId, agentId: String(b.agentId ?? "edge").slice(0, 64), origin: h.origin,
    ts: Number(b.ts) || now, receivedAt: now, values: b.values!, addresses: b.addresses, readProof: b.readProof, note: b.note?.slice(0, 200), s7Verified: h.s7Verified,
  });
  return NextResponse.json({ ok: true, origin: h.origin, s7Verified: h.s7Verified });
}
