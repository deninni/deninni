import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain, predictionsFor } from "@/lib/server/brain";
import { findSimilarCases } from "@/lib/crossplant/similarity";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ assetId: string }> }) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const { assetId } = await params;
    const b = await getBrain(auth.session.tenant);
    const machine = b.g.ancestorOfType(decodeURIComponent(assetId), "machine");
    if (!machine) return NextResponse.json({ error: "Keine Maschine zu diesem Asset" }, { status: 404 });
    const p = predictionsFor(b).find((x) => x.assetId === machine.id)!;
    const similar = findSimilarCases(b.tenant, b.g, b.memory, machine);
    return NextResponse.json({ prediction: p, similar, path: b.g.pathOf(machine.id) });
  });
}
