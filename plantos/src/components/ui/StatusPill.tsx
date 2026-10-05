import type { MachineState } from "@/lib/demo/engine";

const MAP: Record<MachineState, { label: string; cls: string; dot: string }> = {
  RUNNING: { label: "Läuft", cls: "text-status-ok", dot: "bg-status-ok" },
  WARN: { label: "Warnung", cls: "text-status-warn", dot: "bg-status-warn" },
  FAULT: { label: "Störung", cls: "text-status-fault", dot: "bg-status-fault animate-pulse" },
  STOPPED: { label: "Stillstand", cls: "text-muted", dot: "bg-muted" },
};

export function StatusPill({ state }: { state: MachineState }) {
  const m = MAP[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
