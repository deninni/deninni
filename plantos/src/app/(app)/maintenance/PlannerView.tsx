"use client";

import { useState } from "react";
import Link from "next/link";
import { usePoll, postJson } from "@/lib/client/usePoll";
import { useScopeKey } from "@/lib/client/useScope";
import type { PlanItem } from "@/lib/maintenance/planner";
import type { SapAction } from "@/lib/sap/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DemoBadge } from "@/components/ui/DemoBadge";

type Item = PlanItem & { approved: { at: string; actor: string } | null };
const TONE = { P1: "fault", P2: "warn", P3: "accent", P4: "muted" } as const;
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–");
const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

export function PlannerView({ user, canApprove, canExecute }: { user: string; canApprove: boolean; canExecute: boolean }) {
  const k = useScopeKey();
  const plan = usePoll<{ items: Item[]; note: string }>(`/api/maintenance/plan?k=${k}`, 300_000);
  const sap = usePoll<{ actions: SapAction[]; adapter: { mode: string; note: string } }>("/api/sap/actions", 60_000);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function approve(i: Item, prepareSap: boolean) {
    try {
      const r = await postJson<{ sap: SapAction | null }>("/api/maintenance/approve", { assetId: i.assetId, prepareSap });
      setMsg((m) => ({ ...m, [i.assetId]: `Freigegeben${r.sap ? ` · SAP-Meldung ${r.sap.id} vorbereitet (nicht gebucht)` : ""}.` }));
      plan.reload(); sap.reload();
    } catch (e) { setMsg((m) => ({ ...m, [i.assetId]: (e as Error).message })); }
  }
  async function decide(a: SapAction, decision: "execute" | "reject") {
    try {
      await postJson(`/api/sap/actions/${a.id}`, { decision, confirm: true });
      setConfirmId(null); sap.reload();
    } catch (e) { setMsg((m) => ({ ...m, [a.id]: (e as Error).message })); }
  }

  return (
    <div className="space-y-4">
      {!plan.data ? <div className="card h-40 animate-pulse" /> : plan.data.items.length === 0 ? <p className="card p-4 text-[13px] text-muted">Keine Wartung aus Prognose erforderlich.</p> : (
        <ul className="space-y-3">
          {plan.data.items.map((i) => (
            <li key={i.assetId} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[i.priority]}>{i.priority}</Badge>
                <Link href={`/brain/${encodeURIComponent(i.assetId)}`} className="font-medium hover:underline">{i.code}</Link>
                <span className="text-[12px] text-muted">{i.plant} · {i.line}</span>
                <span className="ml-auto"><Badge tone={i.slotType === "geplantes Wartungsfenster" ? "ok" : "warn"}>{i.slotType}</Badge></span>
              </div>
              <div className="mt-2 grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
                <div><div className="label-section">Termin (Vorschlag)</div>{dt(i.recommendedStart)} · {i.durationHours} h</div>
                <div><div className="label-section">Spätestens</div>{dt(i.deadline)}</div>
                <div><div className="label-section">Stillstand / Techniker</div>{i.expectedDowntimeHours} h zusätzlich · {i.technicians} Techn.</div>
                <div><div className="label-section">Risiko</div>{i.failureRiskAtSlotPct} % bis Termin · {i.failureRiskIfPostponed7dPct} % bei +7 T.</div>
              </div>
              <div className="mt-2 text-[12px]"><span className="text-muted">{i.failureMode} · Teile:</span> {i.parts.length ? i.parts.map((p) => <span key={p.material} className={p.available ? "" : "font-medium text-status-fault"}>{p.qty}× {p.name} (SAP {p.material}, Bestand {p.stock}{p.available ? "" : `, Lieferzeit ${p.leadTimeDays} T.`}) </span>) : "keine"}</div>
              <div className="mt-1 text-[12px]"><span className="text-muted">Kosten:</span> Maßnahme {eur(i.cost.costOfAction)} · Nicht-Handeln {eur(i.cost.costIfNoAction)} · Netto {eur(i.cost.netBenefit)} {i.cost.demo && <Badge tone="warn">DEMO-Annahmen</Badge>}</div>
              <ul className="mt-1 list-inside list-disc text-[11px] text-muted">{i.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {i.approved ? <Badge tone="ok">Freigegeben {new Date(i.approved.at).toLocaleDateString("de-DE")} von {i.approved.actor}</Badge> : canApprove ? (
                  <>
                    <Button variant="primary" onClick={() => approve(i, false)}>Freigeben</Button>
                    <Button onClick={() => approve(i, true)}>Freigeben + SAP-Meldung vorbereiten</Button>
                  </>
                ) : <span className="text-[11px] text-stainless-dim">Freigabe durch Werkleitung.</span>}
              </div>
              {msg[i.assetId] && <p className="mt-2 text-[12px] text-accent">{msg[i.assetId]}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-stainless-dim">{plan.data?.note}</p>

      <Card title="SAP-Aktionen" action={sap.data && <span className="flex gap-1.5"><Badge>{sap.data.adapter.mode === "demo" ? "Demo-Adapter" : "OData"}</Badge>{sap.data.adapter.mode === "demo" && <DemoBadge />}</span>} padded={false}>
        {!sap.data?.actions.length ? <p className="p-4 text-[12px] text-muted">Keine vorbereiteten Aktionen.</p> : (
          <ul className="divide-y divide-hairline">
            {sap.data.actions.map((a) => (
              <li key={a.id} className="px-4 py-3 text-[12px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.status === "executed" ? "ok" : a.status === "prepared" ? "accent" : "muted"}>{a.status === "prepared" ? "vorbereitet" : a.status === "executed" ? "ausgeführt" : a.status === "rejected" ? "abgelehnt" : "fehlgeschlagen"}</Badge>
                  <span className="font-medium">{a.draft.shortText}</span><span className="text-muted">Equipment {a.draft.equipment} · Prio {a.draft.priority}</span>
                </div>
                <div className="mt-1 text-muted">vorbereitet von {a.preparedBy} · {new Date(a.preparedAt).toLocaleString("de-DE")}{a.decidedBy ? ` · entschieden von ${a.decidedBy}` : ""}{a.result ? ` · ${a.result.message}` : ""}</div>
                {a.status === "prepared" && canExecute && (
                  a.preparedBy === user ? <p className="mt-1 text-[11px] text-stainless-dim">Vier-Augen-Prinzip: Ausführung durch eine andere berechtigte Person.</p> :
                  confirmId === a.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2"><span>Wirklich an SAP {sap.data!.adapter.mode === "demo" ? "(Demo-Adapter)" : ""} übergeben?</span><Button variant="primary" onClick={() => decide(a, "execute")}>Ja, ausführen</Button><Button variant="ghost" onClick={() => setConfirmId(null)}>Abbrechen</Button></div>
                  ) : (
                    <div className="mt-2 flex gap-2"><Button onClick={() => setConfirmId(a.id)}>Freigeben & ausführen</Button><Button variant="ghost" onClick={() => decide(a, "reject")}>Ablehnen</Button></div>
                  )
                )}
                {msg[a.id] && <p className="mt-1 text-status-fault">{msg[a.id]}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="px-4 py-2 text-[11px] text-stainless-dim">{sap.data?.adapter.note} Ohne konfigurierte SAP-Verbindung schreibt der Demo-Adapter nur lokal.</p>
      </Card>
    </div>
  );
}
