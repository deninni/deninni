import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { MACHINES } from "@/lib/plants";
import { kpis } from "@/lib/demo/engine";
import { currentAlerts } from "@/lib/server/data";
import { readStore } from "@/lib/store/store";
import { de } from "@/lib/format";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Berichte" };

export default async function ReportsPage() {
  const now = Date.now();
  const rows = MACHINES.map((m) => ({ m, s: kpis(m.id, now, 480), d: kpis(m.id, now, 1440) }));
  const alerts = await currentAlerts(now);
  const tickets = (await readStore()).tickets;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Analyse" title="Berichte" subtitle="Generiert aus Demo-KPIs der Engine · OEE = Verfügbarkeit × Leistung × Qualität" actions={<PrintButton />} />
      <Card title="OEE je Anlage" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead><tr className="text-left text-[11px] text-muted"><th className="px-4 py-2 font-medium">Anlage</th><th className="px-4 py-2 font-medium">OEE Schicht</th><th className="px-4 py-2 font-medium">OEE 24 h</th><th className="px-4 py-2 font-medium">Verfügb.</th><th className="px-4 py-2 font-medium">Leistung</th><th className="px-4 py-2 font-medium">Qualität</th><th className="px-4 py-2 font-medium">Gutteile 24 h</th></tr></thead>
            <tbody className="divide-y divide-hairline">
              {rows.map(({ m, s, d }) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 font-medium">{m.code}</td><td className="px-4 py-2">{de(s.oeePct)} %</td><td className="px-4 py-2">{de(d.oeePct)} %</td>
                  <td className="px-4 py-2">{de(d.availabilityPct)} %</td><td className="px-4 py-2">{de(d.performancePct)} %</td><td className="px-4 py-2">{de(d.qualityPct)} %</td>
                  <td className="px-4 py-2">{d.goodUnits.toLocaleString("de-DE")} {m.unit.split("/")[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card title="Meldungen (4 h)"><div className="text-2xl font-semibold tabular-nums">{alerts.length}</div><div className="text-[12px] text-muted">{alerts.filter((a) => a.severity === "FAULT").length} Störungen</div></Card>
        <Card title="Offene Tickets"><div className="text-2xl font-semibold tabular-nums">{tickets.filter((t) => t.status !== "DONE").length}</div><div className="text-[12px] text-muted">{tickets.length} gesamt</div></Card>
        <Card title="Datenquelle"><div className="text-[13px]">Demo-Engine</div><div className="text-[12px] text-muted">Mit Edge-Agent: echte Werte, gleiche Berichte</div></Card>
      </div>
    </div>
  );
}
