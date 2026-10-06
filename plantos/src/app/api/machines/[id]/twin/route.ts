import { NextResponse } from "next/server";
import { isMachineId } from "@/lib/plants";
import { liveSnapshot } from "@/lib/server/data";
import { sampleMachine } from "@/lib/demo/engine";
import { buildTwin } from "@/lib/twin/health";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMachineId(id)) return NextResponse.json({ error: "Anlage unbekannt" }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("mode") ?? "REAL";
  const speedFactor = mode === "SIMULATION" ? Math.min(1.4, Math.max(0.3, Number(sp.get("speedFactor")) || 1)) : 1;
  const bottleFormat = sp.get("format") ?? "1.0";
  let ts = Date.now();
  if (mode === "REPLAY") {
    const ago = Math.min(240, Math.max(0, Number(sp.get("minutesAgo")) || 0));
    ts -= ago * 60_000;
  }
  const snap = mode === "REAL" ? await liveSnapshot(id, ts) : sampleMachine(id, ts);
  return NextResponse.json({ mode, ...buildTwin(snap, { speedFactor, bottleFormat }), signals: snap.signals });
}
