import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { mutateStore } from "@/lib/store/store";
import { currentAlerts } from "@/lib/server/data";
import { createTicket } from "@/lib/tickets/create";
import { audit } from "@/lib/audit";

/** Aktionen: ack | comment | close | ticket */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("operator");
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const alert = (await currentAlerts()).find((a) => a.id === id);
  if (!alert) return NextResponse.json({ error: "Meldung unbekannt" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; text?: string };
  const who = auth.session.sub;
  const now = new Date().toISOString();

  if (body.action === "ticket") {
    const r = await createTicket({
      title: `${alert.machineCode}: ${alert.title}`,
      description: `Aus Meldung ${alert.code} (${alert.severity}), seit ${alert.startedAt}.`,
      machineId: alert.machineId, alertId: alert.id, source: "alert",
      priority: alert.severity === "FAULT" ? "high" : "medium", createdBy: who,
    });
    await audit({ actor: who, action: r.deduped ? "ticket.reported" : "ticket.create", target: r.ticket.id, detail: alert.id });
    return NextResponse.json(r);
  }

  if (!["ack", "comment", "close"].includes(body.action ?? "")) return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
  const text = String(body.text ?? "").trim().slice(0, 1000);
  if (body.action === "comment" && !text) return NextResponse.json({ error: "Kommentar leer" }, { status: 400 });

  const state = await mutateStore((s) => {
    const st = (s.alerts[id] ??= { id, comments: [] });
    if (body.action === "ack" && !st.acknowledgedAt) { st.acknowledgedAt = now; st.acknowledgedBy = who; }
    if (body.action === "close") { st.closedAt = now; st.closedBy = who; st.acknowledgedAt ??= now; st.acknowledgedBy ??= who; }
    if (text) st.comments.push({ by: who, at: now, text });
    return st;
  });
  await audit({ actor: who, action: `alert.${body.action}`, target: id, detail: text || undefined });
  return NextResponse.json({ ok: true, state });
}
