"use client";

import { usePoll } from "@/lib/client/usePoll";
import type { Prediction } from "@/lib/predictive/engine";
import type { SimilarCase } from "@/lib/crossplant/similarity";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { ExplainPanel } from "@/components/ui/ExplainPanel";
import { TrendChart } from "@/components/charts/TrendChart";

const PRIO_TONE = { P1: "fault", P2: "warn", P3: "accent", P4: "muted" } as const;
const d = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

export function PredictionCard({ assetId }: { assetId: string }) {
  const { data } = usePoll<{ prediction: Prediction; similar: { cases: SimilarCase[] }; path: string }>(`/api/predictive/${encodeURIComponent(assetId)}`, 300_000);
  if (!data) return <div className="card h-48 animate-pulse" />;
  const p = data.prediction;
  const main = p.trends.find((t) => t.signal === p.dominant) ?? p.trends.find((t) => t.signal === "vibrationMmS")!;
  const chart = main.daily.map((x) => ({ ts: Date.parse(x.day), value: x.value }));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Card title={`Prognose ${p.code}`} action={<span className="flex gap-1.5"><Badge tone={PRIO_TONE[p.priority]}>{p.priority} · Risiko {p.riskScore}</Badge><DemoBadge /></span>}>
        <div className="space-y-3">
          <div>
            <div className="label-section">Restlebensdauer</div>
            <p className={`mt-1 text-[14px] ${p.rul ? "font-medium" : "text-muted"}`}>{p.rulText}</p>
          </div>
          {p.failureMode && <div className="text-[13px]"><span className="text-muted">Wahrscheinlicher Fehlermodus:</span> {p.failureMode} · Ausfallwahrscheinlichkeit 30 Tage {Math.round(p.failureProbability30d * 100)} %</div>}
          {p.window && <div className="rounded-md border border-accent-border bg-accent-muted px-3 py-2 text-[13px]">Empfohlenes Wartungsfenster: <b>{d(p.window.from)} – {d(p.window.to)}</b><div className="text-[11px] text-muted">{p.window.reason}</div></div>}
          <div>
            <div className="label-section mb-1">{main.label} · Tagesmediane ({main.unit})</div>
            <TrendChart data={chart} height={150} series={[{ key: "value", label: main.label, color: "#5a8fa3", unit: main.unit }]} />
            {main.limit && <p className="text-[11px] text-stainless-dim">Warngrenze {main.limit.warn.toLocaleString("de-DE")} · Alarmgrenze {main.limit.alarm.toLocaleString("de-DE")} {main.unit} ({main.limit.basis})</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums">
              <thead><tr className="text-left text-[11px] text-muted"><th className="py-1 font-medium">Signal</th><th className="font-medium">Niveau</th><th className="font-medium">Trend/Tag</th><th className="font-medium">R²</th><th className="font-medium">bis Alarm</th></tr></thead>
              <tbody className="divide-y divide-hairline">
                {p.trends.map((t) => (
                  <tr key={t.signal}><td className="py-1">{t.label}</td><td>{t.level.toLocaleString("de-DE")} {t.unit}</td><td>{t.slopePerDay > 0 ? "+" : ""}{t.slopePerDay.toLocaleString("de-DE")}</td><td>{t.r2.toLocaleString("de-DE")}</td><td>{t.daysToAlarm != null ? `${t.daysToAlarm.toLocaleString("de-DE")} T.` : t.beyondHorizon ? "> Horizont" : "–"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
            <div><div className="label-section">Laufzeit seit Wartung</div>{p.runtimeHoursSinceMaintenance != null ? `${p.runtimeHoursSinceMaintenance} h / ${p.maintenanceIntervalH} h` : "unbekannt"}</div>
            <div><div className="label-section">Schaltzyklen 7 T.</div>{p.switchCycles7d}</div>
            <div><div className="label-section">Alarme 7 T.</div>{p.alarms7d}</div>
            <div><div className="label-section">Ersatzteile</div>{p.materials.join(", ") || "–"}</div>
          </div>
        </div>
      </Card>
      <Card title="Erklärung (Explainable AI)"><ExplainPanel e={p.explanation} open /></Card>
    </div>
  );
}
