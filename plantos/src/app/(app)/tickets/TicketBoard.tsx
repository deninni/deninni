"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Ticket, TicketStatus } from "@/lib/store/store";
import { postJson } from "@/lib/client/usePoll";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MehrZahlen } from "@/components/ui/MehrZahlen";
import { MACHINES, getMachine } from "@/lib/plants";
import { dateTimeDe } from "@/lib/format";

const STATUS_LABEL: Record<TicketStatus, string> = { OPEN: "Offen", IN_PROGRESS: "In Arbeit", WAITING: "Wartet", DONE: "Erledigt" };

export function TicketBoard({ tickets, canWrite }: { tickets: Ticket[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [machineId, setMachineId] = useState("");
  const open = tickets.filter((t) => t.status !== "DONE");
  const done = tickets.filter((t) => t.status === "DONE");
  const dupGroups = new Set(open.filter((t) => t.dedupeKey).map((t) => t.dedupeKey)).size < open.filter((t) => t.dedupeKey).length;

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); start(() => router.refresh()); } catch (e) { setErr((e as Error).message); }
  };

  const row = (t: Ticket) => (
    <li key={t.id} className="card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={t.priority === "high" ? "fault" : t.priority === "medium" ? "warn" : "muted"}>{t.priority === "high" ? "hoch" : t.priority === "medium" ? "mittel" : "niedrig"}</Badge>
        <span className="text-[13px] font-medium">{t.title}</span>
        <span className="ml-auto font-mono text-[11px] text-muted">{t.id}</span>
      </div>
      {t.description && <p className="mt-1 whitespace-pre-line text-[12px] text-muted">{t.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>{t.machineId ? getMachine(t.machineId)?.code : "Werk"}</span>·<span>{t.source}</span>·<span>{dateTimeDe(t.createdAt)}</span>
        {t.mergedInto && <Badge>zusammengeführt → {t.mergedInto}</Badge>}
        {canWrite ? (
          <select value={t.status} disabled={pending} onChange={(e) => run(() => postJson("/api/tickets", { id: t.id, status: e.target.value }, "PATCH"))} className="input-industrial ml-auto min-h-8 py-1 text-[12px]" aria-label="Status">
            {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        ) : <Badge>{STATUS_LABEL[t.status]}</Badge>}
      </div>
      {t.reportCount > 1 && <MehrZahlen><div className="text-[12px] text-muted">{t.reportCount}× gemeldet · zuletzt {dateTimeDe(t.lastReportedAt)}</div></MehrZahlen>}
    </li>
  );

  return (
    <div className="space-y-4">
      {canWrite && (
        <form className="card flex flex-wrap gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (title.trim().length >= 3) run(async () => { await postJson("/api/tickets", { title, machineId: machineId || undefined }); setTitle(""); }); }}>
          <input className="input-industrial min-h-9 min-w-0 flex-1 text-[13px]" placeholder="Neues Ticket, z. B. „Sichtprüfung Führungsgeländer SR-03“" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <select className="input-industrial min-h-9 text-[13px]" value={machineId} onChange={(e) => setMachineId(e.target.value)} aria-label="Anlage">
            <option value="">Werk</option>{MACHINES.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
          </select>
          <Button variant="primary" disabled={pending || title.trim().length < 3}>Anlegen</Button>
          {dupGroups && <Button type="button" onClick={() => run(() => postJson("/api/tickets/consolidate", {}))}>Duplikate zusammenführen</Button>}
        </form>
      )}
      {err && <p className="text-[12px] text-status-fault">{err}</p>}
      {open.length === 0 && <p className="card p-4 text-[13px] text-muted">Keine offenen Tickets.</p>}
      <ul className="space-y-3">{open.map(row)}</ul>
      {done.length > 0 && <MehrZahlen label={`${done.length} erledigt / zusammengeführt`}><ul className="space-y-3">{done.map(row)}</ul></MehrZahlen>}
    </div>
  );
}
