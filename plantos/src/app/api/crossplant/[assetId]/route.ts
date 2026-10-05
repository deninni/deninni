import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { findSimilarCases } from "@/lib/crossplant/similarity";
import { SIGNATURE_FEATURES } from "@/lib/analytics/signature";
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
    const r = findSimilarCases(b.tenant, b.g, b.memory, m, Date.now(), 5);
    return NextResponse.json({ ...r, features: SIGNATURE_FEATURES, crossPlantLearning: b.tenant.crossPlantLearning, note: r.scope === "tenant" ? "Vergleich über alle Werke dieses Mandanten (freigegeben). Keine Daten anderer Mandanten." : "Werksübergreifender Vergleich für diesen Mandanten deaktiviert – nur Fälle aus demselben Werk." });
  });
}
