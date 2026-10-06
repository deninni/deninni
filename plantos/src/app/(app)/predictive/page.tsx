"use client";

import Link from "next/link";
import { useState } from "react";
import { usePoll } from "@/lib/client/usePoll";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBadge, DemoBadge } from "@/components/ui/DemoBadge";
import { PredictionCard } from "@/components/brain/PredictionCard";
import { useScopeKey } from "@/lib/client/useScope";

type Row = { assetId: string; code: string; name: string; path: string; riskScore: number; priority: "P1" | "P2" | "P3" | "P4"; failureMode: string | null; rulText: string; rul: { days: number } | null; window: { from: string; to: string } | null; confidence: { label: string; score: number } };
const TONE = { P1: "fault", P2: "warn", P3: "accent", P4: "muted" } as const;

export default function PredictivePage() {
  const k = useScopeKey();
  const { data } = usePoll<{ predictions: Row[] }>(`/api/predictive?k=${k}`, 300_000);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader eyebrow="Analyse" title="Predictive Maintenance" subtitle="Trend · Verschlechterung · Ausfallrisiko · Priorität · Wartungsfenster – mit Confidence, ohne Fake-RUL" actions={<DemoBadge />} />
      <Card padded={false}>
        {!data ? <div className="h-40 animate-pulse" /> : (
          <ul className="divide-y divide-hairline">
            {data.predictions.map((p) => (
              <li key={p.assetId}>
                <button onClick={() => setSel(sel === p.assetId ? null : p.assetId)} className={`focus-ring w-full px-4 py-3 text-left ${sel === p.assetId ? "bg-accent-muted" : "hover:bg-surface-elevated/40"}`} aria-expanded={sel === p.assetId}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[p.priority]}>{p.priority}</Badge>
                    <span className="font-medium">{p.code}</span>
                    <span className="text-[12px] text-muted">{p.path}</span>
                    <span className="ml-auto text-[13px] tabular-nums">Risiko <b>{p.riskScore}</b></span>
                  </div>
                  <div className="mt-1 text-[12px] text-muted">{p.failureMode ? `${p.failureMode} · ` : ""}{p.rulText}</div>
                  <div className="mt-1"><ConfidenceBadge label={p.confidence.label} score={p.confidence.score} /></div>
                </button>
                {sel === p.assetId && <div className="border-t border-hairline p-3"><PredictionCard assetId={p.assetId} /><Link href={`/brain/${encodeURIComponent(p.assetId)}`} className="mt-2 inline-block text-[12px] text-accent hover:underline">Asset im Plant Brain öffnen →</Link></div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-[11px] text-stainless-dim">Restlebensdauer nur bei belastbarem Trend (R² ≥ 0,7, |t| ≥ 4, ≥ 10 Tage, Prognose ≤ 3× Beobachtungszeitraum). Sonst: „Nicht genügend Daten für eine belastbare Restlebensdauerprognose.“</p>
    </div>
  );
}
