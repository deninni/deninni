"use client";

import { usePoll } from "@/lib/client/usePoll";
import type { EnergyAnalysis } from "@/lib/energy/analysis";
import { Card } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { ExplainPanel } from "@/components/ui/ExplainPanel";
import { TrendChart } from "@/components/charts/TrendChart";

export function EnergyPanel({ assetId }: { assetId: string }) {
  const { data } = usePoll<{ analysis: EnergyAnalysis; price: number; currency: string; configSource: string }>(`/api/energy/${encodeURIComponent(assetId)}`, 300_000);
  if (!data) return <div className="card h-40 animate-pulse" />;
  const e = data.analysis;
  const cur = data.currency === "USD" ? "$" : "€";
  return (
    <div className="space-y-4">
      <Card title={`Energie ${e.code} · ${e.days} Tage`} action={<DemoBadge />}>
        <div className="kpi-strip">
          <Kpi label="Verbrauch" value={e.kwhPerDay.toLocaleString("de-DE")} unit="kWh/Tag" />
          <Kpi label="pro Einheit" value={e.kwhPerUnit != null ? (e.kwhPerUnit * 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "–"} unit="Wh" hint={e.sollKwhPerUnit != null ? `Soll ${(e.sollKwhPerUnit * 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} Wh (bestes Dezil)` : undefined} />
          <Kpi label="Leerlauf" value={e.idleSharePct.toLocaleString("de-DE")} unit="%" hint={`${e.idleKwh.toLocaleString("de-DE")} kWh`} />
          <Kpi label="Lastspitze 15 min" value={e.peak15minKw.toLocaleString("de-DE")} unit="kW" hint={`Ø ${e.avgKw.toLocaleString("de-DE")} kW`} />
        </div>
        <div className="mt-3"><TrendChart height={150} data={e.daily.map((x) => ({ ts: Date.parse(x.day), kwh: x.kwh }))} series={[{ key: "kwh", label: "kWh/Tag", color: "#c9a227", unit: "kWh" }]} /></div>
        <p className="mt-1 text-[12px] text-muted">Ineffizienztrend {e.trendPerDayPct > 0 ? "+" : ""}{e.trendPerDayPct.toLocaleString("de-DE")} %/Tag · Stromaufnahme {e.unusualCurrent.flagged ? <b className="text-status-warn">ungewöhnlich (z={e.unusualCurrent.z})</b> : `unauffällig (z=${e.unusualCurrent.z})`}</p>
      </Card>
      <Card title="Einsparpotenzial (Schätzung)">
        {e.potentials.length === 0 ? <p className="text-[13px] text-muted">Kein relevantes Potenzial erkannt.</p> : (
          <ul className="space-y-3">
            {e.potentials.map((p) => (
              <li key={p.title} className="rounded-md border border-hairline p-3 text-[13px]">
                <div className="font-medium">{p.title}</div>
                <div className="mt-1 text-[12px]">≈ {p.kwhPerDay.toLocaleString("de-DE")} kWh/Tag · {p.costPerDay.toLocaleString("de-DE")} {cur}/Tag · <b>{p.costPerYear.toLocaleString("de-DE")} {cur}/Jahr</b></div>
                <div className="mt-1 text-[12px]"><span className="text-muted">Empfehlung:</span> {p.recommendation}</div>
                <div className="text-[12px]"><span className="text-muted">Risiko:</span> {p.risk}</div>
                <div className="text-[11px] text-stainless-dim">Annahme: {p.assumption} · Preis {data.price.toLocaleString("de-DE")} {cur}/kWh{data.configSource === "demo-default" ? " (DEMO)" : ""}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-stainless-dim">Keine realisierte Einsparung – Schätzung auf DEMO-Daten. plantOS schaltet nichts um.</p>
        <ExplainPanel e={e.explanation} />
      </Card>
    </div>
  );
}
