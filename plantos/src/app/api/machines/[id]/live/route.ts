import { NextResponse } from "next/server";
import { isMachineId } from "@/lib/plants";
import { liveSnapshot } from "@/lib/server/data";
import { series } from "@/lib/demo/engine";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMachineId(id)) return NextResponse.json({ error: "Anlage unbekannt" }, { status: 404 });
  const now = Date.now();
  const minutes = Math.min(120, Math.max(1, Number(new URL(req.url).searchParams.get("minutes")) || 10));
  const snap = await liveSnapshot(id, now);
  const trail = series(id, now - minutes * 60_000, now - 5000, minutes <= 10 ? 5000 : 30_000).map((p) => ({ ts: p.ts, ...p.signals }));
  return NextResponse.json({ snapshot: snap, trail });
}
