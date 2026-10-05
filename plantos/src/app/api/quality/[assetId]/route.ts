import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { analyzeQuality } from "@/lib/quality/analysis";
import { loadRoiConfig } from "@/lib/roi/config-store";
import { effectiveConfig } from "@/lib/roi/engine";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const { assetId } = await params;
    const b = await getBrain(auth.session.tenant);
    const m = b.g.ancestorOfType(decodeURIComponent(assetId), "machine");
    if (!m) return NextResponse.json({ error: "Keine Maschine zu diesem Asset" }, { status: 404 });
    const hours = [24, 72, 168].includes(Number(new URL(req.url).searchParams.get("hours"))) ? Number(new URL(req.url).searchParams.get("hours")) : 72;
    const cfg = effectiveConfig(await loadRoiConfig(auth.session.tenant), b.g.ancestorOfType(m.id, "plant")?.id);
    return NextResponse.json({ analysis: analyzeQuality(m, cfg.scrapCostPerUnit, Date.now(), hours), currency: cfg.currency, configSource: cfg.source });
  });
}
