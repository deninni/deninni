import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { answerLocal, LOCAL_MODEL_NOTE } from "@/lib/copilot/answer";
import { readStore } from "@/lib/store/store";
import { currentAlerts } from "@/lib/server/data";
import { createTicket } from "@/lib/tickets/create";
import { hasRole } from "@/lib/auth/roles";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireRole("viewer");
  if ("response" in auth) return auth.response;
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const q = String(body.message ?? "").trim().slice(0, 1000);
  if (!q) return NextResponse.json({ error: "Frage fehlt" }, { status: 400 });

  const ans = answerLocal(q, { tickets: (await readStore(auth.session.tenant)).tickets, alerts: await currentAlerts(Date.now(), auth.session.tenant) });
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
