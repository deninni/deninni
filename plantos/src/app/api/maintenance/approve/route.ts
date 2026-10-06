import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain, predictionsFor } from "@/lib/server/brain";
import { planMaintenance } from "@/lib/maintenance/planner";
import { loadRoiConfig } from "@/lib/roi/config-store";
import { addMemory } from "@/lib/memory/store";
import { prepareSapAction } from "@/lib/sap/actions";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

/** Freigabe eines Planvorschlags durch die Werkleitung → Industrial Memory (humanApproval) + optional SAP-Meldung VORBEREITEN. */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireCap("maintenance.approve");
    if ("response" in auth) return auth.response;
    const b0 = await body<{ assetId?: string; prepareSap?: boolean; comment?: string }>(req);
    const b = await getBrain(auth.session.tenant);
    const item = planMaintenance(b.g, predictionsFor(b).filter((p) => p.assetId === b0.assetId), await loadRoiConfig(auth.session.tenant))[0];
    if (!item) return NextResponse.json({ error: "Kein Planvorschlag für dieses Asset" }, { status: 404 });
    const entry = await addMemory(auth.session.tenant, {
      assetId: item.assetId, type: "humanApproval", source: "user", actor: auth.session.sub,
      description: `Wartung freigegeben: ${item.failureMode} ${item.code}, ${item.slotType}${item.recommendedStart ? ` ab ${item.recommendedStart.slice(0, 16).replace("T", " ")} UTC` : ""}.${b0.comment ? ` ${String(b0.comment).slice(0, 500)}` : ""}`,
      meta: { kind: "maintenance-plan", plan: { start: item.recommendedStart, durationHours: item.durationHours, parts: item.parts, slotType: item.slotType }, expectedNetBenefitEur: item.cost.netBenefit, roiDemo: item.cost.demo },
    });
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "maintenance.approved", target: item.assetId, detail: entry.id });
    let sap = null;
    if (b0.prepareSap) {
      const eq = b.g.related(item.assetId, "sapEquipment", "out")[0]?.node.code ?? item.code;
      sap = await prepareSapAction(auth.session.tenant, {
        assetId: item.assetId, by: auth.session.sub, source: `Wartungsplan ${entry.id}`,
        draft: { equipment: eq, shortText: `${item.failureMode} ${item.code}`.slice(0, 40), longText: `${item.reasons.join(" ")}\nTeile: ${item.parts.map((p) => `${p.qty}× ${p.material} ${p.name}`).join(", ") || "–"}\nRisiko bei Verschiebung um 7 Tage: ${item.failureRiskIfPostponed7dPct} %`, priority: item.priority === "P1" ? "1" : item.priority === "P2" ? "2" : "3", notificationType: "M2" },
      });
      await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "sap.prepared", target: sap.id, detail: item.assetId });
    }
    return NextResponse.json({ approval: entry, sap }, { status: 201 });
  });
}
