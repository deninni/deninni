"use client";

import { useState } from "react";
import { Copy, FileDown, TicketPlus } from "lucide-react";
import type { Handover } from "@/lib/handover/build";
import { postJson } from "@/lib/client/usePoll";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MehrZahlen } from "@/components/ui/MehrZahlen";

export function HandoverView({ handover: h, text, canWrite }: { handover: Handover; text: string; canWrite: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={async () => { await navigator.clipboard.writeText(text); setMsg("Klartext kopiert – in WhatsApp / E-Mail einfügen."); }}><Copy size={14} /> Klartext kopieren</Button>
        <a href="/api/handover/pdf" className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-3 text-[13px] font-medium hover:bg-surface-elevated/70 sm:min-h-8"><FileDown size={14} /> Als PDF</a>
        {canWrite && (
          <Button onClick={async () => {
            try {
              const r = await postJson<{ ticket: { id: string } }>("/api/tickets", { title: `Übergabe ${h.shift}: offene Prüfpunkte`, description: text.slice(0, 3900), source: "handover" });
              setMsg(`Ticket ${r.ticket.id} angelegt.`);
            } catch (e) { setMsg((e as Error).message); }
          }}><TicketPlus size={14} /> Ticket anlegen</Button>
        )}
      </div>
      {msg && <p className="text-[12px] text-accent">{msg}</p>}

      <Card title="Anlagen" padded={false}>
        <ul className="divide-y divide-hairline">
          {h.machines.map((m) => (
            <li key={m.machineId} className="px-4 py-3">
              <div className="flex items-center gap-2"><span className="font-medium">{m.code}</span><span className="text-[12px] text-muted">{m.state}</span><span className="ml-auto"><Badge tone={m.source === "DEMO" ? "warn" : "ok"}>{m.source}</Badge></span></div>
              <ul className="mt-1.5 space-y-1 text-[13px]">{m.checks.map((c) => <li key={c} className="flex gap-2"><span className="text-accent">›</span>{c}</li>)}</ul>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`Offene Tickets (${h.openTickets.length})`}>
        {h.openTickets.length === 0 ? <p className="text-[13px] text-muted">Keine.</p> : (
          <ul className="space-y-1 text-[13px]">{h.openTickets.map((t) => <li key={t.id}>{t.title} <span className="text-[11px] text-muted">[{t.status}]</span></li>)}</ul>
        )}
        <MehrZahlen>
          <ul className="space-y-1 text-[12px] text-muted">{h.alerts.map((a, i) => <li key={i}>{a.machineCode} {a.severity}{a.active ? " (aktiv)" : ""}: {a.title} – {a.status}</li>)}</ul>
          <p className="mt-2 text-[12px] text-muted">Steckerverdacht (DEMO): {h.connectorHint}</p>
          <p className="mt-2 text-[11px] text-stainless-dim">{h.demoNote}</p>
        </MehrZahlen>
      </Card>

      <div className="card px-4 py-3 text-[12px] text-muted">Übergeben von: <span className="text-foreground">{h.generatedBy}</span> · Übernommen von: ______________________</div>
      <p className="text-[11px] text-stainless-dim">{h.trust}</p>
    </div>
  );
}
