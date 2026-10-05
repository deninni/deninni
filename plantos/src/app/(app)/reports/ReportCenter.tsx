"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DemoBadge } from "@/components/ui/DemoBadge";
import type { Report } from "@/lib/reports/build";

const TYPES = [
  ["shift", "Schichtbericht"], ["day", "Tagesbericht"], ["week", "Wochenbericht"], ["month", "Monatsbericht"],
  ["maintenance", "Wartungsreport"], ["roi", "ROI-Report"], ["energy", "Energie-Report"], ["management", "Management Summary"],
] as const;

export function ReportCenter() {
  const [type, setType] = useState<string>("management");
  const [rep, setRep] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  async function load(t: string) {
    setType(t); setBusy(true);
    try { const r = await fetch(`/api/reports/${t}`); setRep((await r.json()).report); } finally { setBusy(false); }
  }
  return (
    <Card title="Berichtszentrale" action={<DemoBadge />}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TYPES.map(([id, label]) => (
          <button key={id} onClick={() => load(id)} className={`focus-ring min-h-11 rounded-md border px-2 text-[12px] ${type === id && rep ? "border-accent-border bg-accent-muted" : "border-border"}`}>{label}</button>
        ))}
      </div>
      {busy && <div className="mt-3 h-24 animate-pulse rounded bg-surface-elevated" />}
      {rep && !busy && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{rep.title}</h3>
            <a href={`/api/reports/${rep.type}?format=pdf`} className="focus-ring ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-3 text-[13px] sm:min-h-8"><FileDown size={14} /> PDF</a>
          </div>
          {rep.sections.map((s) => (
            <section key={s.heading}>
              <div className="label-section mb-1">{s.heading}</div>
              <ul className="space-y-0.5 text-[12px]">{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </section>
          ))}
          <p className="text-[11px] text-stainless-dim">{rep.dataNote}</p>
        </div>
      )}
      {!rep && !busy && <p className="mt-3 text-[12px] text-muted">Berichtstyp wählen – Vorschau hier, PDF zum Versand.</p>}
    </Card>
  );
}
