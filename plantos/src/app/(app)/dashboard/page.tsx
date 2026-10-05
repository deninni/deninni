import Link from "next/link";
import { ArrowRight, AlertTriangle, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { MehrZahlen } from "@/components/ui/MehrZahlen";
import { Kpi } from "@/components/ui/Kpi";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { liveAll, currentAlerts } from "@/lib/server/data";
import { kpis } from "@/lib/demo/engine";
import { getMachine } from "@/lib/plants";
import { runRca } from "@/lib/rca/rules";
import { de, agoDe } from "@/lib/format";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const RANK = { FAULT: 0, WARN: 1, STOPPED: 2, RUNNING: 3 } as const;

export default async function DashboardPage() {
  const now = Date.now();
  const snaps = (await liveAll(now)).sort((a, b) => RANK[a.state] - RANK[b.state]);
  const alerts = (await currentAlerts(now)).filter((a) => a.status !== "CLOSED");
  const active = alerts.filter((a) => a.active);
  const insights = snaps.flatMap((s) => runRca(s).hypotheses.slice(0, 1).map((h) => ({ m: getMachine(s.machineId)!, h })));
  const k = snaps.map((s) => ({ s, k: kpis(s.machineId, now) }));
  const plantOee = k.reduce((a, x) => a + x.k.oeePct, 0) / k.length;
  const sources = new Set(snaps.map((s) => s.source));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        gradient="radial-gradient(800px 300px at 15% 20%, rgba(90,143,163,.35), transparent 60%), linear-gradient(135deg,#132131 0%,#0c141d 60%,#0a0e14 100%)"
        eyebrow={BRAND.site}
        title="Dashboard"
        subtitle="Übersicht aller Anlagen · Control Room"
        actions={<AutoRefresh intervalMs={10_000} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Anlagenstatus – Aufmerksamkeit zuerst" className="lg:col-span-2" padded={false}
          action={<Badge tone={sources.has("DEMO") ? "warn" : "ok"}>{[...sources].join(" · ")}</Badge>}>
          <ul className="divide-y divide-hairline">
            {snaps.map((s) => {
              const m = getMachine(s.machineId)!;
              return (
                <li key={s.machineId}>
                  <Link href={`/anlagen/${m.id}`} className="focus-ring flex items-center gap-4 px-4 py-3 hover:bg-surface-elevated/50">
                    <div className="h-10 w-1 rounded-full" style={{ background: s.state === "FAULT" ? "#c45c5c" : s.state === "WARN" ? "#c9a227" : s.state === "STOPPED" ? "#52525b" : "#3d9b72" }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.name}</span>
                        <StatusPill state={s.state} />
                      </div>
                      <div className="truncate text-[12px] text-muted">{s.activeIncident ? s.activeIncident.title : m.description}</div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="font-semibold tabular-nums">{de(s.signals.outputRate, 0)}</div>
                      <div className="text-[11px] text-muted">{m.unit}</div>
                    </div>
                    <ArrowRight size={15} className="text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Kritische / Warn-Meldungen" action={<Link href="/alerts" className="text-[12px] text-accent hover:underline">alle</Link>}>
          {active.length === 0 ? (
            <p className="text-[13px] text-muted">Keine aktiven Meldungen.</p>
          ) : (
            <ul className="space-y-2.5">
              {active.slice(0, 4).map((a) => (
                <li key={a.id} className="flex gap-2.5">
                  <AlertTriangle size={15} className={a.severity === "FAULT" ? "mt-0.5 text-status-fault" : "mt-0.5 text-status-warn"} />
                  <div className="min-w-0">
                    <div className="text-[13px] leading-snug">{a.title}</div>
                    <div className="text-[11px] text-muted">{a.machineCode} · {agoDe(a.startedAt, now)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <MehrZahlen>
            <div className="text-[12px] text-muted">{alerts.length} offene Meldungen (4 h) · {alerts.filter((a) => a.status === "NEW").length} unbestätigt</div>
          </MehrZahlen>
        </Card>

        <Card title="KI-Insights (regelbasiert)" className="lg:col-span-3">
          {insights.length === 0 ? (
            <p className="text-[13px] text-muted">Regelbaum findet aktuell keine Auffälligkeit. Alle Messwerte im Normalband.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {insights.map(({ m, h }) => (
                <li key={m.id + h.code} className="flex gap-2.5 rounded-md border border-hairline p-3">
                  <Lightbulb size={15} className="mt-0.5 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{m.code}: {h.title}</div>
                    <div className="mt-0.5 text-[12px] text-muted">Prüfen: {h.checks[0]}</div>
                    <div className="mt-1.5 flex gap-2">
                      <Badge tone="accent">Konfidenz {h.confidence}</Badge>
                      <Link href={`/anlagen/${m.id}?tab=rca`} className="text-[12px] text-accent hover:underline">Ursachenanalyse</Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <MehrZahlen>
            <div className="kpi-strip">
              <Kpi label="Werks-OEE (8 h)" value={de(plantOee)} unit="%" />
              {k.map(({ s, k }) => (
                <Kpi key={s.machineId} label={`${getMachine(s.machineId)!.code} OEE`} value={de(k.oeePct)} unit="%" hint={`V ${de(k.availabilityPct)} · L ${de(k.performancePct)} · Q ${de(k.qualityPct)}`} />
              ))}
            </div>
          </MehrZahlen>
        </Card>
      </div>
    </div>
  );
}
