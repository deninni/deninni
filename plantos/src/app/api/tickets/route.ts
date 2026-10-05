import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { mutateStore, readStore, type TicketStatus } from "@/lib/store/store";
import { createTicket } from "@/lib/tickets/create";
import { audit } from "@/lib/audit";
import { isMachineId } from "@/lib/plants";

export const dynamic = "force-dynamic";
const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING", "DONE"];

export async function GET() {
  const auth = await requireRole("viewer");
  if ("response" in auth) return auth.response;
  const s = await readStore(auth.session.tenant);
  return NextResponse.json({ tickets: [...s.tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
}

export async function POST(req: Request) {
  const auth = await requireRole("operator");
  if ("response" in auth) return auth.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  const title = String(b.title ?? "").trim();
  if (title.length < 3) return NextResponse.json({ error: "Titel zu kurz" }, { status: 400 });
  const machineId = b.machineId && isMachineId(b.machineId) ? b.machineId : null;
  const r = await createTicket({
    title, description: b.description, machineId, alertId: b.alertId ?? null,
    priority: (["low", "medium", "high"].includes(b.priority) ? b.priority : "medium") as "low" | "medium" | "high",
    source: (["manual", "handover", "copilot"].includes(b.source) ? b.source : "manual") as "manual",
    createdBy: auth.session.sub,
    tenant: auth.session.tenant,
  });
  await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: r.deduped ? "ticket.reported" : "ticket.create", target: r.ticket.id, detail: r.ticket.title });
  return NextResponse.json(r, { status: r.deduped ? 200 : 201 });
}

export async function PATCH(req: Request) {
  const auth = await requireRole("operator");
  if ("response" in auth) return auth.response;
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: TicketStatus };
  if (!b.id || !b.status || !STATUSES.includes(b.status)) return NextResponse.json({ error: "id/status ungültig" }, { status: 400 });
  const t = await mutateStore((s) => {
    const t = s.tickets.find((x) => x.id === b.id);
    if (t) { t.status = b.status!; t.updatedAt = new Date().toISOString(); }
    return t;
  }, auth.session.tenant);
  if (!t) return NextResponse.json({ error: "Ticket unbekannt" }, { status: 404 });
  await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "ticket.status", target: t.id, detail: b.status });
  return NextResponse.json({ ticket: t });
}
