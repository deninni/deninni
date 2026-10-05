"use client";

import { useState } from "react";
import { usePoll } from "@/lib/client/usePoll";
import { useScopeKey } from "@/lib/client/useScope";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { EnergyPanel } from "@/components/brain/EnergyPanel";

type Row = { assetId: string; code: string; plant: string; line: string; kwhPerDay: number; kwhPerUnit: number | null; idleSharePct: number; peak15minKw: number; istVsSollPct: number | null; potentialPerYear: number; unusualCurrent: { flagged: boolean } };

export default function EnergyPage() {
  const k = useScopeKey();
  const { data } = usePoll<{ rows: Row[]; byLine: { name: string; kwhPerDay: number }[]; note: string }>(`/api/energy?k=${k}`, 300_000);
  const [sel, setSel] = useState<string | null>(null);
  const total = data?.rows.reduce((a, r) => a + r.kwhPerDay, 0) ?? 0;
  const pot = data?.rows.reduce((a, r) => a + r.potentialPerYear, 0) ?? 0;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader eyebrow="Analyse" title="Energie" subtitle="Verbrauch je Maschine/Linie/Einheit · Leerlauf · Lastspitzen · Ist/Soll · Potenzial" actions={<DemoBadge />} />
      <div className="kpi-strip">
        <div><div className="label-section">Verbrauch</div><div className="mt-1 text-lg font-semibold tabular-nums">{Math.round(total).toLocaleString("de-DE")} <span className="text-[12px] font-normal text-muted">kWh/Tag</span></div></div>
        <div><div className="label-section">Potenzial (Schätzung)</div><div className="mt-1 text-lg font-semibold tabular-nums">{Math.round(pot).toLocaleString("de-DE")} <span className="text-[12px] font-normal text-muted">€/Jahr</span></div></div>
        <div><div className="label-section">Linien</div><div className="mt-1 text-[12px]">{data?.byLine.slice(0, 3).map((l) => <div key={l.name}>{l.name}: {l.kwhPerDay.toLocaleString("de-DE")} kWh/Tag</div>)}</div></div>
      </div>
      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px] tabular-nums">
            <thead><tr className="text-left text-[11px] text-muted"><th className="px-4 py-2 font-medium">Maschine</th><th className="font-medium">kWh/Tag</th><th className="font-medium">Wh/Einheit</th><th className="font-medium">Leerlauf</th><th className="font-medium">Peak kW</th><th className="font-medium">Ist/Soll</th><th className="px-4 font-medium">Potenzial €/J.</th></tr></thead>
            <tbody className="divide-y divide-hairline">
              {(data?.rows ?? []).sort((a, b) => b.potentialPerYear - a.potentialPerYear).map((r) => (
                <tr key={r.assetId} onClick={() => setSel(r.assetId)} className={`cursor-pointer ${sel === r.assetId ? "bg-accent-muted" : "hover:bg-surface-elevated/40"}`}>
                  <td className="px-4 py-2"><div className="font-medium">{r.code}</div><div className="text-[10px] text-muted">{r.plant} · {r.line}</div></td>
                  <td>{r.kwhPerDay.toLocaleString("de-DE")}</td><td>{r.kwhPerUnit != null ? (r.kwhPerUnit * 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–"}</td>
                  <td>{r.idleSharePct.toLocaleString("de-DE")} %</td><td>{r.peak15minKw.toLocaleString("de-DE")}</td>
                  <td>{r.istVsSollPct != null ? `+${r.istVsSollPct.toLocaleString("de-DE")} %` : "–"}</td><td className="px-4">{Math.round(r.potentialPerYear).toLocaleString("de-DE")}{r.unusualCurrent.flagged ? " ⚠" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-stainless-dim">{data?.note}</p>
      </Card>
      {sel && <EnergyPanel assetId={sel} />}
    </div>
  );
}
