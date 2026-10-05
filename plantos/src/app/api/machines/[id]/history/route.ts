import { NextResponse } from "next/server";
import { isMachineId } from "@/lib/plants";
import { detectAnomalies } from "@/lib/history/anomaly";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMachineId(id)) return NextResponse.json({ error: "Anlage unbekannt" }, { status: 404 });
  const hours = Math.min(24, Math.max(1, Number(new URL(req.url).searchParams.get("hours")) || 6));
  const now = Date.now();
  const step = hours <= 6 ? 60_000 : 300_000;
  const { points, windows } = detectAnomalies(id, now - hours * 3600_000, now, step);
  return NextResponse.json({
    hours,
    method: "Median/MAD z-Score > 3,5 (Heuristik)",
    points: points.map((p) => ({ ts: p.ts, state: p.state, ...p.signals })),
    windows,
  });
}
