import { Badge } from "./Badge";

export function DemoBadge({ demo = true, label }: { demo?: boolean; label?: string }) {
  return demo ? <Badge tone="warn" title="Demo-Daten – keine realen Kundendaten">{label ?? "DEMO"}</Badge> : <Badge tone="ok">{label ?? "REAL"}</Badge>;
}

export function ConfidenceBadge({ label, score }: { label: string; score?: number }) {
  return <Badge tone={label === "hoch" ? "ok" : label === "mittel" ? "accent" : "muted"} title={score != null ? `Confidence ${Math.round(score * 100)} %` : undefined}>Confidence {label}{score != null ? ` · ${Math.round(score * 100)} %` : ""}</Badge>;
}
