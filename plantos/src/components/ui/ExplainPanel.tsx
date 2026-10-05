import type { Explanation } from "@/lib/analytics/explain";
import { ConfidenceBadge } from "./DemoBadge";
import { MehrZahlen } from "./MehrZahlen";

/** Explainable AI: Daten, Zeitraum, Begründung, Confidence, Alternativen, Lücken, ähnliche Fälle, nächste Prüfung. */
export function ExplainPanel({ e, open = false }: { e: Explanation; open?: boolean }) {
  const d = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
  const body = (
    <div className="space-y-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2"><ConfidenceBadge label={e.confidence.label} score={e.confidence.score} /><span className="text-muted">{e.confidence.why}</span></div>
      <div><div className="label-section mb-1">Warum</div><ul className="list-inside list-disc space-y-0.5 text-muted">{e.reasoning.map((r) => <li key={r}>{r}</li>)}</ul></div>
      <div><div className="label-section mb-1">Verwendete Daten · {d(e.period.from)} – {d(e.period.to)}</div>
        <ul className="space-y-0.5 text-muted">{e.usedData.map((u) => <li key={u.signal}>{u.signal} · {u.source} · {u.samples} Werte{u.note ? ` · ${u.note}` : ""}</li>)}</ul></div>
      {e.alternatives.length > 0 && <div><div className="label-section mb-1">Alternative Ursachen</div><ul className="list-inside list-disc text-muted">{e.alternatives.map((a) => <li key={a}>{a}</li>)}</ul></div>}
      {e.missingData.length > 0 && <div><div className="label-section mb-1">Fehlende Daten</div><p className="text-muted">{e.missingData.join(" · ")}</p></div>}
      {e.similarCases.length > 0 && <div><div className="label-section mb-1">Ähnliche historische Fälle</div><ul className="text-muted">{e.similarCases.map((c) => <li key={c.memoryId}>{c.similarityPct} % · {c.plant}: {c.title}</li>)}</ul></div>}
      <div><div className="label-section mb-1">Empfohlene nächste Prüfung</div><p>{e.nextCheck}</p></div>
      <p className="text-[11px] text-stainless-dim">Methode: {e.method}</p>
    </div>
  );
  return open ? body : <MehrZahlen label="Warum? (Erklärung)">{body}</MehrZahlen>;
}
