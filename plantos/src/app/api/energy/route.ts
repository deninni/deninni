import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain, resolveScope } from "@/lib/server/brain";
import { analyzeEnergy } from "@/lib/energy/analysis";
import { loadRoiConfig } from "@/lib/roi/config-store";
import { effectiveConfig } from "@/lib/roi/engine";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const b = await getBrain(auth.session.tenant);
    const scope = resolveScope(b, new URL(req.url).searchParams.get("scope"));
    const cfg = await loadRoiConfig(auth.session.tenant);
    const rows = b.g.machinesUnder(scope).map((m) => {
      const plantId = b.g.ancestorOfType(m.id, "plant")?.id;
      const e = analyzeEnergy(m, effectiveConfig(cfg, plantId).energyPricePerKwh, Date.now(), 7);
      const { daily, explanation, ...rest } = e;
      return { ...rest, path: b.g.pathOf(m.id), line: b.g.ancestorOfType(m.id, "line")?.name, plant: b.g.ancestorOfType(m.id, "plant")?.name, potentialPerYear: e.potentials.reduce((a, p) => a + p.costPerYear, 0), confidence: explanation.confidence };
    });
    const byLine = new Map<string, number>();
    for (const r of rows) byLine.set(`${r.plant} · ${r.line}`, (byLine.get(`${r.plant} · ${r.line}`) ?? 0) + r.kwhPerDay);
    return NextResponse.json({ scope, rows, byLine: [...byLine].map(([name, kwhPerDay]) => ({ name, kwhPerDay: Math.round(kwhPerDay) })), configSource: cfg.source, note: "Leistung aus Strom berechnet (DEMO-Engine). Einsparpotenziale sind Schätzungen mit Annahmen – keine realisierten Einsparungen." });
  });
}
