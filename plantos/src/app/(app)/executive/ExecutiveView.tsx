"use client";

import Link from "next/link";
import { useState } from "react";
import { usePoll } from "@/lib/client/usePoll";
import { useScopeKey } from "@/lib/client/useScope";
import type { ScopeKpis } from "@/lib/enterprise/rollup";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { TrendChart } from "@/components/charts/TrendChart";

type Ent = { scope: ScopeKpis; path: { id: string; name: string }[]; tenant: { name: string; demo: boolean } };
type Val = { periods: Record<"month" | "year", { realized: number; realizedDemo: number; approved: number; approvedDemo: number }> };
const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

function Tile({ label, value, unit, hint, tone }: { label: string; value: string | number; unit?: string; hint?: string; tone?: "warn" | "fault" | "ok" }) {
  return (
    <div className="card p-3">
      <div className="label-section">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === "fault" ? "text-status-fault" : tone === "warn" ? "text-status-warn" : ""}`}>{value}{unit && <span className="ml-1 text-[12px] font-normal text-muted">{unit}</span>}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function ExecutiveView() {
  const k = useScopeKey();
  const [days, setDays] = useState(14);
  const ent = usePoll<Ent>(`/api/enterprise?depth=1&k=${k}`, 300_000);
  const val = usePoll<Val>(`/api/roi/value?k=${k}`, 300_000);
  const trend = usePoll<{ oee: { day: string; oeePct: number }[] }>(`/api/enterprise/trend?days=${days}&k=${k}`, 600_000);
  const tickets = usePoll<{ tickets: { status: string }[] }>("/api/tickets", 300_000);
  const s = ent.data?.scope;
  if (!s) return <div className="card h-48 animate-pulse" />;
  const openActions = tickets.data?.tickets.filter((t) => t.status !== "DONE").length ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-medium">{s.name}</span><span className="text-muted">· {s.machines} Maschinen</span>{ent.data?.tenant.demo && <DemoBadge />}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="OEE (8 h)" value={s.oeePct.toLocaleString("de-DE")} unit="%" hint={`Verfügbarkeit ${s.availabilityPct.toLocaleString("de-DE")} %`} />
        <Tile label="Stillstand (24 h)" value={s.stopMinutes24h.toLocaleString("de-DE")} unit="min" hint={`${s.alarms24h} Alarmfenster`} />
        <Tile label="Predictive-Alerts" value={s.predictiveAlerts} tone={s.predictiveAlerts ? "warn" : undefined} hint={`max. Risiko ${s.riskMax}/100`} />
        <Tile label="Wartung ≤ 14 Tage" value={s.maintenanceDue14d} hint="Vorschläge im Planer" />
        <Tile label="Ersatzteile < Mindestbestand" value={s.sparePartsBelowMin} tone={s.sparePartsBelowMin ? "fault" : undefined} />
        <Tile label="Qualität (8 h)" value={s.qualityPct.toLocaleString("de-DE")} unit="%" />
        <Tile label="Energie (24 h)" value={Math.round(s.energyKwh24h).toLocaleString("de-DE")} unit="kWh" />
        <Tile label="Offene Maßnahmen" value={openActions} hint="Tickets (alle Werke des Mandanten)" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="OEE-Trend" className="lg:col-span-2" action={<select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input-industrial min-h-8 py-1 text-[12px]" aria-label="Zeitraum"><option value={7}>Woche</option><option value={14}>14 Tage</option><option value={28}>Monat</option></select>}>
          {trend.data ? <TrendChart height={200} data={trend.data.oee.map((x) => ({ ts: Date.parse(x.day), oee: x.oeePct }))} series={[{ key: "oee", label: "OEE", color: "#5a8fa3", unit: "%" }]} yDomain={[50, 100]} /> : <div className="h-[200px] animate-pulse" />}
          <p className="text-[11px] text-stainless-dim">Tageswerte aus Demo-Engine (15-min-Raster).</p>
        </Card>
        <Card title="plantOS ROI">
          {val.data && (
            <div className="space-y-2 text-[13px]">
              <div><div className="label-section">Vermiedene Kosten (Jahr, verifiziert)</div><div className="text-xl font-semibold tabular-nums">{eur(val.data.periods.year.realized)}</div></div>
              {val.data.periods.year.realizedDemo > 0 && <div className="text-[12px] text-status-warn">DEMO-Werte: {eur(val.data.periods.year.realizedDemo)} (nicht real)</div>}
              <div className="text-[12px] text-muted">Erwartet aus freigegebenen Maßnahmen: {eur(val.data.periods.year.approved + val.data.periods.year.approvedDemo)}</div>
              <Link href="/value" className="tap text-[12px] text-accent hover:underline">Details & Annahmen →</Link>
            </div>
          )}
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top-Risiken">
          {s.critical.length === 0 ? <p className="text-[13px] text-muted">Keine Maschine mit erhöhtem Risiko.</p> : (
            <ul className="space-y-2">{s.critical.map((c) => <li key={c.assetId} className="flex items-center gap-2 text-[13px]"><Badge tone={c.priority === "P1" ? "fault" : "warn"}>{c.priority}</Badge><Link href={`/brain/${encodeURIComponent(c.assetId)}`} className="tap font-medium hover:underline">{c.code}</Link><span className="ml-auto tabular-nums">Risiko {c.riskScore}</span></li>)}</ul>
          )}
          <Link href="/predictive" className="tap mt-2 inline-block text-[12px] text-accent hover:underline">Alle Prognosen →</Link>
        </Card>
        <Card title="Ebenen" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-[12px] tabular-nums">
              <thead><tr className="text-left text-[11px] text-muted"><th className="px-4 py-2 font-medium">Einheit</th><th className="font-medium">OEE</th><th className="font-medium">Stopp min</th><th className="font-medium">Risiko</th><th className="px-4 font-medium">Teile</th></tr></thead>
              <tbody className="divide-y divide-hairline">
                {s.children.map((c) => <tr key={c.id}><td className="px-4 py-2"><Link href={c.type === "machine" ? `/brain/${encodeURIComponent(c.id)}` : `/enterprise?scope=${encodeURIComponent(c.id)}`} className="hover:underline">{c.name}</Link></td><td>{c.oeePct.toLocaleString("de-DE")} %</td><td>{c.stopMinutes24h}</td><td>{c.riskMax}</td><td className="px-4">{c.sparePartsBelowMin}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
