import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { analyzeEnergy } from "@/lib/energy/analysis";
import { loadRoiConfig } from "@/lib/roi/config-store";
import { effectiveConfig } from "@/lib/roi/engine";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ assetId: string }> }) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const { assetId } = await params;
    const b = await getBrain(auth.session.tenant);
    const m = b.g.ancestorOfType(decodeURIComponent(assetId), "machine");
    if (!m) return NextResponse.json({ error: "Keine Maschine zu diesem Asset" }, { status: 404 });
    const cfg = effectiveConfig(await loadRoiConfig(auth.session.tenant), b.g.ancestorOfType(m.id, "plant")?.id);
    return NextResponse.json({ analysis: analyzeEnergy(m, cfg.energyPricePerKwh), price: cfg.energyPricePerKwh, currency: cfg.currency, configSource: cfg.source });
  });
}
