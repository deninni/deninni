import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain, predictionsFor, resolveScope } from "@/lib/server/brain";
import { planMaintenance } from "@/lib/maintenance/planner";
import { loadRoiConfig } from "@/lib/roi/config-store";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const b = await getBrain(auth.session.tenant);
    const scope = resolveScope(b, new URL(req.url).searchParams.get("scope"));
    const inScope = new Set(b.g.machinesUnder(scope).map((m) => m.id));
    const items = planMaintenance(b.g, predictionsFor(b).filter((p) => inScope.has(p.assetId)), await loadRoiConfig(auth.session.tenant));
    const approvals = b.memory.filter((m) => m.type === "humanApproval" && m.meta.kind === "maintenance-plan");
    return NextResponse.json({
      scope,
      items: items.map((i) => ({ ...i, approved: approvals.find((a) => a.assetId === i.assetId && Date.parse(a.at) > Date.now() - 14 * 86_400_000) ?? null })),
      note: "Vorschläge – keine automatische Buchung. Freigabe durch Werkleitung, SAP-Meldung nur nach zweiter Freigabe.",
    });
  });
}
