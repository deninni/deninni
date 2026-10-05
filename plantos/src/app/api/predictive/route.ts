import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain, predictionsFor } from "@/lib/server/brain";
import { scopeFrom } from "@/lib/server/scope";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const b = await getBrain(auth.session.tenant);
    const scope = await scopeFrom(b, req);
    const inScope = new Set(b.g.machinesUnder(scope).map((m) => m.id));
    const preds = predictionsFor(b).filter((p) => inScope.has(p.assetId)).sort((a, c) => c.riskScore - a.riskScore);
    return NextResponse.json({
      scope,
      predictions: preds.map(({ trends, explanation, ...p }) => ({ ...p, path: b.g.pathOf(p.assetId), confidence: explanation.confidence, trends: trends.map(({ daily, ...t }) => t) })),
    });
  });
}
