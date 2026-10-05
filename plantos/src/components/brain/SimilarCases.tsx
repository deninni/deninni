"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client/usePoll";
import type { SimilarCase } from "@/lib/crossplant/similarity";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function SimilarCases({ assetId }: { assetId: string }) {
  const { data } = usePoll<{ cases: SimilarCase[]; signature: number[]; features: string[]; note: string; crossPlantLearning: boolean }>(`/api/crossplant/${encodeURIComponent(assetId)}`, 300_000);
  if (!data) return <div className="card h-40 animate-pulse" />;
  return (
    <Card title="Cross-Plant Learning · ähnliche historische Fälle" action={<Badge tone={data.crossPlantLearning ? "accent" : "muted"}>{data.crossPlantLearning ? "werksübergreifend" : "nur dieses Werk"}</Badge>}>
      <p className="mb-3 text-[12px] text-muted">{data.note}</p>
      {data.cases.length === 0 ? <p className="text-[13px] text-muted">Keine vergleichbaren Fehlerfälle gespeichert.</p> : (
        <ul className="space-y-3">
          {data.cases.map((c) => (
            <li key={c.memoryId} className="rounded-md border border-hairline p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold tabular-nums text-accent">{c.similarityPct} %</span>
                <span className="text-[13px]">ähnlich zu <b>{c.title}</b></span>
                {c.demo && <Badge tone="warn">DEMO</Badge>}
              </div>
              <div className="mt-1 text-[12px] text-muted">{c.plant} · {c.line} · {new Date(c.at).toLocaleDateString("de-DE")} · <Link href={`/brain/${encodeURIComponent(c.assetId)}`} className="text-accent hover:underline">{c.assetPath}</Link></div>
              <div className="mt-2 grid gap-1 text-[12px] sm:grid-cols-2">
                <div>Sensormuster {c.breakdown.sensorPattern} % · Alarmmuster {c.breakdown.alarmPattern} %</div>
                <div>Maschinentyp {c.breakdown.sameMachineType ? "gleich" : "anders"} · Komponente {c.breakdown.sameComponent ? "vorhanden" : "–"}</div>
                {c.closestFeatures.length > 0 && <div className="sm:col-span-2">Übereinstimmend: {c.closestFeatures.join(", ")}</div>}
                {c.cause && <div className="sm:col-span-2"><span className="text-muted">Ursache damals:</span> {c.cause}</div>}
                {c.repair && <div className="sm:col-span-2"><span className="text-muted">Maßnahme damals:</span> {c.repair}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-stainless-dim">Methode: Kosinus-Ähnlichkeit von 7 Zustandsmerkmalen ({data.features.join(", ")}) + Maschinentyp + Komponente + Alarmrate. Kein Modelltraining, keine Daten anderer Mandanten.</p>
    </Card>
  );
}
