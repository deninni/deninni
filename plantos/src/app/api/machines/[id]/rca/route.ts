import { NextResponse } from "next/server";
import { getMachine, isMachineId } from "@/lib/plants";
import { liveSnapshot } from "@/lib/server/data";
import { runRca, rcaTicketTitle } from "@/lib/rca/rules";
import { requireRole } from "@/lib/auth/server";
import { createTicket } from "@/lib/tickets/create";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMachineId(id)) return NextResponse.json({ error: "Anlage unbekannt" }, { status: 404 });
  return NextResponse.json(runRca(await liveSnapshot(id)));
}

/** RCA → Ticket (Supervised: Ticket ja, Eingriff nein). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("operator");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!isMachineId(id)) return NextResponse.json({ error: "Anlage unbekannt" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const rca = runRca(await liveSnapshot(id));
  const hyp = rca.hypotheses.find((h) => h.code === body.code) ?? rca.hypotheses[0];
  if (!hyp) return NextResponse.json({ error: "Keine RCA-Hypothese aktiv" }, { status: 409 });
  const res = await createTicket({
    title: rcaTicketTitle(getMachine(id)!.code, hyp),
    description: `Evidenz: ${hyp.evidence.join("; ")}\nPrüfschritte: ${hyp.checks.join("; ")}`,
    machineId: id,
    priority: hyp.confidence === "hoch" ? "high" : "medium",
    source: "rca",
    createdBy: auth.session.sub,
  });
  await audit({ actor: auth.session.sub, action: res.deduped ? "ticket.reported" : "ticket.create", target: res.ticket.id, detail: res.ticket.title });
  return NextResponse.json(res);
}
