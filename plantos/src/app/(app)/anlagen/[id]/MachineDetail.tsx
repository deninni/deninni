"use client";

import { useState } from "react";
import Link from "next/link";
import type { MachineDef } from "@/lib/plants";
import type { Snapshot } from "@/lib/demo/engine";
import type { RcaResult } from "@/lib/rca/rules";
import { usePoll, postJson } from "@/lib/client/usePoll";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Kpi } from "@/components/ui/Kpi";
import { MehrZahlen } from "@/components/ui/MehrZahlen";
import { TrendChart } from "@/components/charts/TrendChart";
import { LAYOUTS } from "@/lib/twin/layouts";
import { de } from "@/lib/format";

const TABS = [
  { id: "overview", label: "Kennzahlen" },
  { id: "charts", label: "Charts" },
  { id: "components", label: "Komponenten" },
  { id: "rca", label: "Ursachenanalyse" },
] as const;

type Live = { snapshot: Snapshot & { edgeAgent?: string }; trail: ({ ts: number } & Snapshot["signals"])[] };

export function MachineDetail({ machine, initialTab, canWrite }: { machine: MachineDef; initialTab?: string; canWrite: boolean }) {
  const [tab, setTab] = useState<string>(TABS.some((t) => t.id === initialTab) ? initialTab! : "overview");
  const live = usePoll<Live>(`/api/machines/${machine.id}/live?minutes=30`, 3000);
  const s = live.data?.snapshot;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-hairline" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`focus-ring -mb-px min-h-11 whitespace-nowrap border-b-2 px-3 text-[13px] sm:min-h-9 ${tab === t.id ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
        <Link href={`/digital-twin?machine=${machine.id}`} className="ml-auto self-center whitespace-nowrap px-2 text-[12px] text-accent hover:underline">Digital Twin →</Link>
      </div>

      {!s ? <div className="card h-40 animate-pulse" /> : (
        <>
          {tab === "overview" && (
            <Card title="Zustand" action={<span className="flex items-center gap-2"><StatusPill state={s.state} /><Badge tone={s.source === "DEMO" ? "warn" : "ok"}>{s.source}</Badge></span>}>
              {s.activeIncident && <div className="mb-3 rounded-md border border-status-warn/30 bg-status-warn/5 px-3 py-2 text-[13px]">{s.activeIncident.title}</div>}
              <div className="kpi-strip">
                <Kpi label="Ausbringung" value={de(s.signals.outputRate, 0)} unit={machine.unit} />
                <Kpi label="Geschwindigkeit" value={de(s.signals.speedPercent)} unit="%" />
              </div>
              <MehrZahlen>
                <div className="kpi-strip">
                  <Kpi label="Motorstrom" value={de(s.signals.motorCurrentA, 2)} unit="A" />
                  <Kpi label="Temperatur" value={de(s.signals.temperatureC)} unit="°C" />
                  <Kpi label="Vibration" value={de(s.signals.vibrationMmS, 2)} unit="mm/s" />
                  <Kpi label="Ausschuss" value={de(s.signals.rejectRatePct, 2)} unit="%" />
                </div>
              </MehrZahlen>
            </Card>
          )}
          {tab === "charts" && live.data && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Motorstrom (A)"><TrendChart data={live.data.trail} series={[{ key: "motorCurrentA", label: "Strom", color: "#5a8fa3", unit: "A" }]} /></Card>
              <Card title="Temperatur (°C)"><TrendChart data={live.data.trail} series={[{ key: "temperatureC", label: "Temperatur", color: "#c9a227", unit: "°C" }]} /></Card>
              <Card title="Geschwindigkeit (%)"><TrendChart data={live.data.trail} series={[{ key: "speedPercent", label: "Geschwindigkeit", color: "#3d9b72", unit: "%" }]} /></Card>
            </div>
          )}
          {tab === "components" && (
            <Card title="Komponenten & SPS-Tags" padded={false}>
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[11px] text-muted"><th className="px-4 py-2 font-medium">Komponente</th><th className="px-4 py-2 font-medium">Typ</th><th className="px-4 py-2 font-medium">SPS-Tag</th></tr></thead>
                <tbody className="divide-y divide-hairline">
                  {LAYOUTS[machine.id].nodes.map((n) => (
                    <tr key={n.id} className={s.activeIncident?.component === n.id ? "bg-status-warn/5" : ""}>
                      <td className="px-4 py-2">{n.label}</td>
                      <td className="px-4 py-2 text-muted">{n.kind}</td>
                      <td className="px-4 py-2 font-mono text-[11px] text-stainless">{n.plcTag ? `${n.plcTag} · ${n.plcAddress}` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-[11px] text-stainless-dim">Tags aus Demo-Layout. Echte Tags kommen per Symbolliste (Connect). Nur Lesen.</p>
            </Card>
          )}
          {tab === "rca" && <RcaPanel machineId={machine.id} canWrite={canWrite} />}
        </>
      )}
    </div>
  );
}

export function RcaPanel({ machineId, canWrite }: { machineId: string; canWrite: boolean }) {
  const rca = usePoll<RcaResult>(`/api/machines/${machineId}/rca`, 5000);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ticket(code: string) {
    setBusy(true);
    try {
      const r = await postJson<{ deduped: boolean; ticket: { id: string; reportCount: number } }>(`/api/machines/${machineId}/rca`, { code });
      setMsg(r.deduped ? `Bestehendes Ticket ${r.ticket.id} ergänzt (${r.ticket.reportCount}× gemeldet).` : `Ticket ${r.ticket.id} angelegt.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!rca.data) return <div className="card h-32 animate-pulse" />;
  return (
    <Card title="Ursachenanalyse · Regelbaum (Heuristik)" action={<Badge tone="muted">kein ML · nicht zertifiziert</Badge>}>
      {rca.data.hypotheses.length === 0 && <p className="text-[13px] text-muted">{rca.data.note}</p>}
      <ul className="space-y-3">
        {rca.data.hypotheses.map((h) => (
          <li key={h.code} className="rounded-md border border-hairline p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-stainless">{h.code}</span>
              <span className="text-[13px] font-medium">{h.title}</span>
              <Badge tone={h.confidence === "hoch" ? "warn" : "muted"}>Konfidenz {h.confidence}</Badge>
            </div>
            <div className="mt-2 grid gap-2 text-[12px] sm:grid-cols-2">
              <div><div className="label-section mb-1">Evidenz</div><ul className="list-inside list-disc text-muted">{h.evidence.map((e) => <li key={e}>{e}</li>)}</ul></div>
              <div><div className="label-section mb-1">Prüfschritte</div><ol className="list-inside list-decimal text-muted">{h.checks.map((c) => <li key={c}>{c}</li>)}</ol></div>
            </div>
            {canWrite && <Button className="mt-3" onClick={() => ticket(h.code)} disabled={busy}>Ticket aus RCA</Button>}
          </li>
        ))}
      </ul>
      {msg && <p className="mt-3 text-[12px] text-accent">{msg}</p>}
      <p className="mt-3 text-[11px] text-stainless-dim">{rca.data.hypotheses.length ? rca.data.note : ""} Trust: Supervised.</p>
    </Card>
  );
}
