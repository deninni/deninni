import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { MACHINES } from "@/lib/plants";
import { kpis } from "@/lib/demo/engine";
import { de } from "@/lib/format";
import { PrintButton } from "./PrintButton";
import { ReportCenter } from "./ReportCenter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Berichte" };

export default async function ReportsPage() {
  const now = Date.now();
  const rows = MACHINES.map((m) => ({ m, s: kpis(m.id, now, 480), d: kpis(m.id, now, 1440, undefined, 5) }));
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader eyebrow="Analyse" title="Berichte" subtitle="Automatisch aus den plantOS-Engines · PDF-Export · Scope = gewähltes Werk/Ebene" actions={<PrintButton />} />
      <ReportCenter />
      <Card title="OEE Werk Nord (Bestandsanlagen)" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px] tabular-nums">
            <thead><tr className="text-left text-[11px] text-muted"><th className="px-4 py-2 font-medium">Anlage</th><th className="px-4 py-2 font-medium">OEE Schicht</th><th className="px-4 py-2 font-medium">OEE 24 h</th><th className="px-4 py-2 font-medium">Verfügb.</th><th className="px-4 py-2 font-medium">Leistung</th><th className="px-4 py-2 font-medium">Qualität</th></tr></thead>
            <tbody className="divide-y divide-hairline">
              {rows.map(({ m, s, d }) => (
                <tr key={m.id}><td className="px-4 py-2 font-medium">{m.code}</td><td className="px-4 py-2">{de(s.oeePct)} %</td><td className="px-4 py-2">{de(d.oeePct)} %</td><td className="px-4 py-2">{de(d.availabilityPct)} %</td><td className="px-4 py-2">{de(d.performancePct)} %</td><td className="px-4 py-2">{de(d.qualityPct)} %</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
