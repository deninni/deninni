"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Alert } from "@/lib/alerts";
import { postJson } from "@/lib/client/usePoll";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MehrZahlen } from "@/components/ui/MehrZahlen";
import { dateTimeDe, timeDe } from "@/lib/format";

export function AlertsList({ alerts, canWrite }: { alerts: Alert[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [comment, setComment] = useState<Record<string, string>>({});
  const open = alerts.filter((a) => a.status !== "CLOSED");
  const closed = alerts.filter((a) => a.status === "CLOSED");

  async function act(a: Alert, action: string) {
    try {
      const r = await postJson<{ deduped?: boolean; ticket?: { id: string; reportCount: number } }>(`/api/alerts/${a.id}`, { action, text: comment[a.id] });
      if (r.ticket) setMsg((m) => ({ ...m, [a.id]: r.deduped ? `An Ticket ${r.ticket!.id} angehängt (${r.ticket!.reportCount}×)` : `Ticket ${r.ticket!.id} angelegt` }));
      setComment((c) => ({ ...c, [a.id]: "" }));
      start(() => router.refresh());
    } catch (e) {
      setMsg((m) => ({ ...m, [a.id]: (e as Error).message }));
    }
  }

  const row = (a: Alert) => (
    <li key={a.id} className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={a.severity === "FAULT" ? "fault" : "warn"}>{a.severity}</Badge>
        {a.active && <Badge tone="accent">aktiv</Badge>}
        <span className="text-[13px] font-medium">{a.title}</span>
        <span className="ml-auto text-[11px] text-muted tabular-nums">{a.machineCode} · {timeDe(a.startedAt)}{a.endedAt ? `–${timeDe(a.endedAt)}` : ""}</span>
      </div>
      <div className="mt-1 text-[12px] text-muted">
        {a.status === "NEW" ? "Unbestätigt" : a.status === "ACKNOWLEDGED" ? `Bestätigt von ${a.acknowledgedBy}` : "Geschlossen"}
      </div>
      {a.comments.length > 0 && (
        <ul className="mt-2 space-y-1 border-l border-hairline pl-3 text-[12px]">
          {a.comments.map((c, i) => <li key={i}><span className="text-muted">{c.by} · {dateTimeDe(c.at)}:</span> {c.text}</li>)}
        </ul>
      )}
      {canWrite && a.status !== "CLOSED" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {a.status === "NEW" && <Button variant="primary" disabled={pending} onClick={() => act(a, "ack")}>Bestätigen</Button>}
          <Button disabled={pending} onClick={() => act(a, "ticket")}>Ticket</Button>
          <Button variant="ghost" disabled={pending} onClick={() => act(a, "close")}>Schließen</Button>
          <input className="input-industrial min-h-9 min-w-0 flex-1 text-[12px]" placeholder="Kommentar …" value={comment[a.id] ?? ""} onChange={(e) => setComment((c) => ({ ...c, [a.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && comment[a.id]) act(a, "comment"); }} maxLength={1000} />
        </div>
      )}
      {msg[a.id] && <div className="mt-2 text-[12px] text-accent">{msg[a.id]}</div>}
    </li>
  );

  return (
    <div>
      {open.length === 0 && <p className="card p-4 text-[13px] text-muted">Keine offenen Meldungen.</p>}
      <ul className="space-y-3">{open.map(row)}</ul>
      {closed.length > 0 && <MehrZahlen label={`${closed.length} geschlossene Meldungen`}><ul className="space-y-3">{closed.map(row)}</ul></MehrZahlen>}
      {!canWrite && <p className="mt-3 text-[11px] text-stainless-dim">Lesende Rolle: Aktionen sind der Schicht/Instandhaltung vorbehalten.</p>}
    </div>
  );
}
