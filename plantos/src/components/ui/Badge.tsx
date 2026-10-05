import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "fault" | "info" | "accent" | "muted";

const TONE: Record<Tone, string> = {
  ok: "text-status-ok border-status-ok/40 bg-status-ok/10",
  warn: "text-status-warn border-status-warn/40 bg-status-warn/10",
  fault: "text-status-fault border-status-fault/40 bg-status-fault/10",
  info: "text-status-info border-status-info/40 bg-status-info/10",
  accent: "text-accent border-accent-border bg-accent-muted",
  muted: "text-muted",
};

export function Badge({ tone = "muted", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge-industrial ${TONE[tone]}`} title={title}>
      {children}
    </span>
  );
}
