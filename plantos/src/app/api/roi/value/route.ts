import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain, resolveScope } from "@/lib/server/brain";
import { valueItems, summarizeValue, PERIOD_LABEL } from "@/lib/roi/ledger";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const b = await getBrain(auth.session.tenant);
    const scope = resolveScope(b, new URL(req.url).searchParams.get("scope"));
    const ids = new Set([scope, ...b.g.descendants(scope).map((n) => n.id)]);
    const s = summarizeValue(valueItems(b.g, b.memory), ids);
    const name = (id: string) => b.g.node(id)?.name ?? id;
    return NextResponse.json({
      scope, periodLabels: PERIOD_LABEL, ...s,
      byPlant: Object.entries(s.byPlant).map(([id, v]) => ({ id, name: name(id), value: Math.round(v) })),
      byLine: Object.entries(s.byLine).map(([id, v]) => ({ id, name: `${b.g.ancestorOfType(id, "plant")?.name ?? ""} · ${name(id)}`, value: Math.round(v) })),
      byMachine: Object.entries(s.byMachine).map(([id, v]) => ({ id, name: b.g.node(id)?.code ?? id, value: Math.round(v) })),
      items: s.items.map((i) => ({ ...i, assetPath: b.g.pathOf(i.assetId) })),
      note: "Nur Einträge aus dem Industrial Memory: realisiert = verifiziertes Ergebnis nach Maßnahme; erwartet = freigegebene Maßnahme ohne Ergebnis. DEMO-Werte getrennt ausgewiesen.",
    });
  });
}
