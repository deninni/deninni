import { NextResponse } from "next/server";
import { liveAll } from "@/lib/server/data";
import { kpis } from "@/lib/demo/engine";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const withKpis = new URL(req.url).searchParams.get("kpis") === "1";
  const snaps = await liveAll();
  return NextResponse.json({ ts: Date.now(), machines: snaps.map((s) => ({ ...s, kpis: withKpis ? kpis(s.machineId, s.ts) : undefined })) });
}
