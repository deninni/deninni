import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { answerLocal, LOCAL_MODEL_NOTE } from "@/lib/copilot/answer";
import { readStore } from "@/lib/store/store";
import { currentAlerts } from "@/lib/server/data";
import { createTicket } from "@/lib/tickets/create";
import { hasRole } from "@/lib/auth/roles";
import { audit } from "@/lib/audit";
import { classifyPlantScope, wantsTicketFromRca } from "@/lib/copilot/scope";
import { answerEnterprise } from "@/lib/copilot/enterprise";
import { getBrain, predictionsFor, metricsFor } from "@/lib/server/brain";
import { currentScope } from "@/lib/server/scope";
import { loadRoiConfig } from "@/lib/roi/config-store";
import { planMaintenance } from "@/lib/maintenance/planner";
import { analyzeEnergy } from "@/lib/energy/analysis";
import { findSimilarCases } from "@/lib/crossplant/similarity";
import { effectiveConfig } from "@/lib/roi/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireRole("viewer");
  if ("response" in auth) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const q = String(body.message ?? "").trim().slice(0, 1000);
  if (!q) return NextResponse.json({ error: "Frage fehlt" }, { status: 400 });

  const tickets = (await readStore(auth.session.tenant)).tickets;
  const alerts = await currentAlerts(Date.now(), auth.session.tenant);

  // Erweiterte Antworten aus Plant Brain / Memory / Predictive / ROI – Scope-Guard läuft zuerst
  if (classifyPlantScope(q) === "plant" && !wantsTicketFromRca(q)) {
    const brain = await getBrain(auth.session.tenant);
    const cfg = await loadRoiConfig(auth.session.tenant);
    const preds = predictionsFor(brain);
    const ent = answerEnterprise(q, {
      brain, preds, metrics: metricsFor(brain), cfg, tickets, alerts, scopeId: await currentScope(brain),
      plan: () => planMaintenance(brain.g, preds, cfg),
      energy: () => brain.g.machinesUnder(brain.g.doc.nodes.find((n) => n.type === "company")?.id ?? "").map((m) => ({ ...analyzeEnergy(m, effectiveConfig(cfg, brain.g.ancestorOfType(m.id, "plant")?.id).energyPricePerKwh, Date.now(), 7), assetId: m.id })),
      similar: (m) => findSimilarCases(brain.tenant, brain.g, brain.memory, m).cases,
    });
    if (ent) return NextResponse.json({ kind: "answer", text: ent.text, sources: ent.sources, machineId: ent.assetId ?? null, ticket: null, model: "lokal-regelbasiert", note: LOCAL_MODEL_NOTE });
  }

  const ans = answerLocal(q, { tickets, alerts });
  let ticket = null;
  let text = ans.text;
  if (ans.kind === "ticket-request" && ans.ticketRequest) {
    if (!hasRole(auth.session.role, "operator")) {
      text += "\nTicket nicht angelegt: Rolle „Schicht/Instandhaltung“ erforderlich.";
    } else {
      const r = await createTicket({ ...ans.ticketRequest, source: "copilot", priority: "medium", createdBy: auth.session.sub, tenant: auth.session.tenant });
      ticket = r;
      text += r.deduped ? `\nBestehendes Ticket ${r.ticket.id} ergänzt (${r.ticket.reportCount}× gemeldet).` : `\nTicket ${r.ticket.id} angelegt.`;
      await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: r.deduped ? "ticket.reported" : "ticket.create", target: r.ticket.id, detail: "Copilot" });
    }
  }
  if (ans.kind === "control-refusal") await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "copilot.control-refused", detail: q.slice(0, 200) });
  return NextResponse.json({ ...ans, text, ticket, model: "lokal-regelbasiert", note: LOCAL_MODEL_NOTE });
}
