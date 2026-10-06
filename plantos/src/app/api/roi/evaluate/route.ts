import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { loadRoiConfig } from "@/lib/roi/config-store";
import { evaluateScenario, effectiveConfig, type Scenario } from "@/lib/roi/engine";
import { handle, body } from "@/lib/server/http";

/** Eigene Szenarien bewerten (z. B. „Was kostet es, wenn wir nicht handeln?“). */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const s = await body<Partial<Scenario> & { plantId?: string }>(req);
    const num = (v: unknown, lo: number, hi: number, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const a = (s.action ?? {}) as Partial<Scenario["action"]>;
    const scenario: Scenario = {
      title: String(s.title ?? "Szenario").slice(0, 120), kind: "anomaly", probability: num(s.probability, 0, 1), horizonDays: num(s.horizonDays, 1, 365, 30),
      downtimeHoursIfEvent: num(s.downtimeHoursIfEvent, 0, 1000), scrapUnitsIfEvent: num(s.scrapUnitsIfEvent, 0, 1e7), secondaryDamageCost: num(s.secondaryDamageCost, 0, 1e7),
      extraEnergyKwh: num(s.extraEnergyKwh, 0, 1e8), extraScrapUnits: num(s.extraScrapUnits, 0, 1e8),
      action: { maintenanceHours: num(a.maintenanceHours, 0, 1000), technicians: num(a.technicians, 0, 50, 1), partsCost: num(a.partsCost, 0, 1e7), plannedDowntimeHours: num(a.plannedDowntimeHours, 0, 1000), inPlannedWindow: !!a.inPlannedWindow },
      analysisConfidence: num(s.analysisConfidence, 0, 1, 0.5),
    };
    return NextResponse.json({ result: evaluateScenario(scenario, effectiveConfig(await loadRoiConfig(auth.session.tenant), s.plantId)) });
  });
}
