"use client";

import { useState } from "react";
import Link from "next/link";
import { usePoll, postJson } from "@/lib/client/usePoll";
import { useScopeKey } from "@/lib/client/useScope";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfidenceBadge } from "@/components/ui/DemoBadge";
import type { RoiConfig, RoiResult } from "@/lib/roi/engine";

type P = { realized: number; realizedDemo: number; approved: number; approvedDemo: number };
type V = { periods: Record<"today" | "week" | "month" | "year", P>; periodLabels: Record<string, string>; byPlant: { id: string; name: string; value: number }[]; byLine: { id: string; name: string; value: number }[]; byMachine: { id: string; name: string; value: number }[]; items: { memoryId: string; at: string; amount: number; kind: string; demo: boolean; description: string; assetPath: string; assetId: string }[]; note: string };

const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

export function ValueView({ canConfig }: { canConfig: boolean }) {
  const k = useScopeKey();
  const { data } = usePoll<V>(`/api/roi/value?k=${k}`, 300_000);
  const cfg = usePoll<{ config: RoiConfig; fields: { key: keyof RoiConfig; label: string; unit: string }[] }>("/api/roi/config", 600_000);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [sc, setSc] = useState({ probability: 0.4, downtimeHoursIfEvent: 6, maintenanceHours: 4, technicians: 2, partsCost: 120, inPlannedWindow: true });
  const [res, setRes] = useState<RoiResult | null>(null);

  async function saveCfg() {
    try {
      const patch = Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== "").map(([k2, v]) => [k2, Number(v.replace(",", "."))]));
      await postJson("/api/roi/config", patch, "PATCH");
      setEdit({}); setMsg("Gespeichert und protokolliert."); cfg.reload();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function evaluate() {
    const r = await postJson<{ result: RoiResult }>("/api/roi/evaluate", { title: "Eigenes Szenario", probability: sc.probability, downtimeHoursIfEvent: sc.downtimeHoursIfEvent, horizonDays: 30, analysisConfidence: 0.6, action: { maintenanceHours: sc.maintenanceHours, technicians: sc.technicians, partsCost: sc.partsCost, plannedDowntimeHours: sc.maintenanceHours, inPlannedWindow: sc.inPlannedWindow } });
    setRes(r.result);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["today", "week", "month", "year"] as const).map((p) => (
          <div key={p} className="card p-3">
            <div className="label-section">{data?.periodLabels[p] ?? p}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{data ? eur(data.periods[p].realized) : "–"}</div>
            <div className="text-[11px] text-muted">realisiert (verifiziert)</div>
            {data && data.periods[p].realizedDemo > 0 && <div className="mt-1 text-[11px] text-status-warn">+ {eur(data.periods[p].realizedDemo)} DEMO-Werte</div>}
            {data && data.periods[p].approved + data.periods[p].approvedDemo > 0 && <div className="text-[11px] text-muted">erwartet: {eur(data.periods[p].approved + data.periods[p].approvedDemo)}{data.periods[p].approvedDemo ? " (DEMO)" : ""}</div>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-stainless-dim">{data?.note}</p>

      <div className="grid gap-4 lg:grid-cols-3">
        {(["byPlant", "byLine", "byMachine"] as const).map((g) => (
          <Card key={g} title={g === "byPlant" ? "pro Werk" : g === "byLine" ? "pro Linie" : "pro Maschine"}>
            {!data?.[g].length ? <p className="text-[12px] text-muted">Keine realisierten Werte.</p> : <ul className="space-y-1 text-[12px]">{data[g].sort((a, b) => b.value - a.value).map((x) => <li key={x.id} className="flex justify-between gap-2"><span className="truncate">{x.name}</span><span className="tabular-nums">{eur(x.value)}</span></li>)}</ul>}
          </Card>
        ))}
      </div>

      <Card title="Nachweise (Industrial Memory)" padded={false}>
        <ul className="divide-y divide-hairline">
          {(data?.items ?? []).map((i) => (
            <li key={i.memoryId} className="px-4 py-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={i.kind === "realized" ? "ok" : "accent"}>{i.kind === "realized" ? "realisiert" : "erwartet"}</Badge>{i.demo && <Badge tone="warn">DEMO</Badge>}<span className="tabular-nums font-medium">{eur(i.amount)}</span><span className="text-muted">{new Date(i.at).toLocaleDateString("de-DE")}</span></div>
              <div className="mt-0.5">{i.description}</div>
              <Link href={`/brain/${encodeURIComponent(i.assetId)}`} className="tap text-[11px] text-accent hover:underline">{i.assetPath}</Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Annahmen (ROI-Konfiguration)" action={cfg.data && <Badge tone={cfg.data.config.source === "demo-default" ? "warn" : "ok"}>{cfg.data.config.source === "demo-default" ? "DEMO-Annahmen" : `konfiguriert von ${cfg.data.config.updatedBy}`}</Badge>}>
          {cfg.data && (
            <div className="space-y-2">
              {cfg.data.fields.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-muted">{f.label}</span>
                  <span className="flex items-center gap-1">
                    <input disabled={!canConfig} inputMode="decimal" value={edit[f.key] ?? String(cfg.data!.config[f.key])} onChange={(e) => setEdit((x) => ({ ...x, [f.key]: e.target.value }))} className="input-industrial min-h-9 w-28 py-1 text-right tabular-nums" />
                    <span className="w-12 text-[11px] text-muted">{f.unit}</span>
                  </span>
                </label>
              ))}
              {canConfig ? <Button variant="primary" onClick={saveCfg} disabled={!Object.keys(edit).length}>Speichern</Button> : <p className="text-[11px] text-stainless-dim">Änderung nur durch Werkleitung/Admin.</p>}
              {msg && <p className="text-[12px] text-accent">{msg}</p>}
            </div>
          )}
        </Card>
        <Card title="Szenario bewerten (Nicht-Handeln vs. Maßnahme)">
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            {([["probability", "Eintrittswahrsch. (0–1)", 0.05], ["downtimeHoursIfEvent", "Stillstand bei Ausfall (h)", 0.5], ["maintenanceHours", "Wartungsdauer (h)", 0.5], ["technicians", "Techniker", 1], ["partsCost", "Teilekosten (€)", 10]] as const).map(([key, label, step]) => (
              <label key={key} className="block"><span className="text-muted">{label}</span><input type="number" step={step} value={sc[key]} onChange={(e) => setSc((s) => ({ ...s, [key]: Number(e.target.value) }))} className="input-industrial mt-0.5 min-h-9 w-full tabular-nums" /></label>
            ))}
            <label className="col-span-2 flex min-h-9 items-center gap-2"><input type="checkbox" checked={sc.inPlannedWindow} onChange={(e) => setSc((s) => ({ ...s, inPlannedWindow: e.target.checked }))} /> im geplanten Wartungsfenster</label>
          </div>
          <Button className="mt-2" onClick={evaluate}>Berechnen</Button>
          {res && (
            <div className="mt-3 space-y-1 text-[12px]">
              <div className="grid grid-cols-2 gap-1 tabular-nums">
                <span className="text-muted">Kosten bei Nicht-Handeln</span><span>{eur(res.costIfNoAction)}</span>
                <span className="text-muted">Kosten der Maßnahme</span><span>{eur(res.costOfAction)}</span>
                <span className="text-muted">Vermiedene Kosten</span><span>{eur(res.avoidedCost)}</span>
                <span className="text-muted">Netto-Nutzen</span><span className="font-semibold">{eur(res.netBenefit)}</span>
                <span className="text-muted">ROI</span><span>{res.roiPct != null ? `${res.roiPct.toLocaleString("de-DE")} %` : "–"}</span>
              </div>
              <ConfidenceBadge label={res.confidenceLabel} score={res.confidence} />
              <ul className="mt-1 text-[11px] text-muted">{res.assumptions.map((a) => <li key={a.name}>{a.name}: {a.value} <span className="text-stainless-dim">({a.origin})</span></li>)}</ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
