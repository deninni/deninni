import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { oeeTrend } from "@/lib/enterprise/rollup";
import { scopeFrom } from "@/lib/server/scope";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const cache = new Map<string, { at: number; data: unknown }>();

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const b = await getBrain(auth.session.tenant);
    const scope = await scopeFrom(b, req);
    const days = [7, 14, 28].includes(Number(sp.get("days"))) ? Number(sp.get("days")) : 14;
    const key = `${auth.session.tenant}:${scope}:${days}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 600_000) return NextResponse.json(hit.data);
    const data = { scope, days, oee: oeeTrend(b.g, scope, days), source: "DEMO" };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data);
  });
}
