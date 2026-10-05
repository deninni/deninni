"use client";

import { useState } from "react";
import { usePoll } from "@/lib/client/usePoll";
import type { QualityAnalysis } from "@/lib/quality/analysis";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBadge, DemoBadge } from "@/components/ui/DemoBadge";
import { ExplainPanel } from "@/components/ui/ExplainPanel";

export function QualityPanel({ assetId }: { assetId: string }) {
  const [hours, setHours] = useState(72);
  const { data } = usePoll<{ analysis: QualityAnalysis; currency: string; configSource: string }>(`/api/quality/${encodeURIComponent(assetId)}?hours=${hours}`, 300_000);
  const cur = data?.currency === "USD" ? "$" : "€";
  return (
    <Card title="Quality AI · Ausschuss-Korrelationen" action={<span className="flex items-center gap-2"><select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="input-industrial min-h-8 py-1 text-[12px]" aria-label="Zeitraum"><option value={24}>24 h</option><option value={72}>72 h</option><option value={168}>7 Tage</option></select><DemoBadge /></span>}>
      {!data ? <div className="h-40 animate-pulse" /> : (
        <div className="space-y-3">
          <p className="text-[12px] text-muted">Grundausschuss {data.analysis.baselineRejectPct.toLocaleString("de-DE")} % · {data.analysis.samples} Betriebspunkte (5 min)</p>
          {data.analysis.findings.length === 0 ? <p className="text-[13px] text-muted">Keine signifikante Korrelation.</p> : (
            <ul className="space-y-3">
              {data.analysis.findings.map((f, i) => (
                <li key={i} className="rounded-md border border-hairline p-3">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={f.kind === "combined" ? "accent" : "muted"}>{f.kind === "combined" ? "Kombination" : f.kind === "category" ? "Gruppe" : "Einzelparameter"}</Badge><ConfidenceBadge label={f.confidenceLabel} score={f.confidence} /></div>
                  <p className="mt-1.5 text-[14px] font-medium">{f.text}</p>
                  <div className="mt-1 grid gap-1 text-[12px] sm:grid-cols-2">
                    <div><span className="text-muted">Ausschuss im Bereich:</span> {f.rejectInPct.toLocaleString("de-DE")} % (n={f.nIn}) vs. {f.rejectOutPct.toLocaleString("de-DE")} % (n={f.nOut})</div>
                    <div><span className="text-muted">Wirtschaftlich:</span> ≈ {f.impactPerDay.scrapUnits.toLocaleString("de-DE")} Einheiten · {f.impactPerDay.cost.toLocaleString("de-DE")} {cur}/Tag{data.configSource === "demo-default" ? " (DEMO-Kostensatz)" : ""}</div>
                    <div className="sm:col-span-2"><span className="text-muted">Mögliche Ursache:</span> {f.possibleCause}</div>
                    <div className="sm:col-span-2"><span className="text-muted">Empfohlener Bereich:</span> {f.recommendedRange}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-stainless-dim">{data.analysis.note}</p>
          <ExplainPanel e={data.analysis.explanation} />
        </div>
      )}
    </Card>
  );
}
