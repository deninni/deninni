"use client";

import { useState } from "react";
import { MACHINES, getMachine } from "@/lib/plants";
import type { Snapshot } from "@/lib/demo/engine";
import { usePoll } from "@/lib/client/usePoll";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusPill } from "@/components/ui/StatusPill";
import { TrendChart } from "@/components/charts/TrendChart";
import { de, timeDe } from "@/lib/format";
import { LAYOUTS } from "@/lib/twin/layouts";

type Live = { snapshot: Snapshot & { edgeAgent?: string; s7Verified?: boolean }; trail: ({ ts: number } & Snapshot["signals"])[] };

export default function LivePage() {
  const [id, setId] = useState<string>("m-af12");
  const { data } = usePoll<Live>(`/api/machines/${id}/live?minutes=10`, 2500);
  const m = getMachine(id)!;
  const s = data?.snapshot;
  const trail = data && s ? [...data.trail, { ts: s.ts, ...s.signals }] : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Werk Nord" title="Live Monitor" subtitle="Aktualisierung ca. alle 2,5 s · nur Lesen"
        actions={<select value={id} onChange={(e) => setId(e.target.value)} className="input-industrial min-h-9 text-[13px]" aria-label="Anlage">{MACHINES.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select>} />

      <div className="card mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[12px]">
        <span className="label-section">Datenpfad</span>
        <span>SPS / Connector</span><span className="text-muted">→</span><span>Edge-Agent</span><span className="text-muted">→</span><span>Sample</span><span className="text-muted">→</span><span>Live / Twin</span>
        <span className="ml-auto flex items-center gap-2">
          {s && <><span className="live-dot" /><Badge tone={s.source === "DEMO" ? "warn" : "ok"}>{s.source}</Badge>{s.s7Verified && <Badge tone="ok">S7 verifiziert</Badge>}</>}
        </span>
        <div className="w-full text-[11px] text-stainless-dim">Ehrlich · kein Fake-Siemens-PDU · SIMULATED_EDGE ≠ S7_EDGE{s?.edgeAgent ? ` · Agent ${s.edgeAgent}` : ""}</div>
      </div>

      {s && (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-lg font-semibold">{m.name}</span><StatusPill state={s.state} />
          <span className="ml-auto text-[12px] text-muted tabular-nums">Stand {timeDe(s.ts, true)}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Motorstrom · ${s ? de(s.signals.motorCurrentA, 2) : "–"} A`}><TrendChart data={trail} showSeconds series={[{ key: "motorCurrentA", label: "Strom", color: "#5a8fa3", unit: "A" }]} /></Card>
        <Card title={`Temperatur · ${s ? de(s.signals.temperatureC) : "–"} °C`}><TrendChart data={trail} showSeconds series={[{ key: "temperatureC", label: "Temperatur", color: "#c9a227", unit: "°C" }]} /></Card>
        <Card title={`Geschwindigkeit · ${s ? de(s.signals.speedPercent) : "–"} %`}><TrendChart data={trail} showSeconds series={[{ key: "speedPercent", label: "Geschwindigkeit", color: "#3d9b72", unit: "%" }]} /></Card>
      </div>

      <Card title="SPS-Tags (lesend)" className="mt-4" padded={false}>
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[11px] text-muted"><th className="px-4 py-2 font-medium">Tag</th><th className="px-4 py-2 font-medium">Adresse</th><th className="px-4 py-2 font-medium">Komponente</th><th className="px-4 py-2 font-medium">Quelle</th></tr></thead>
          <tbody className="divide-y divide-hairline">
            {LAYOUTS[m.id].nodes.filter((n) => n.plcTag).map((n) => (
              <tr key={n.id}><td className="px-4 py-1.5 font-mono">{n.plcTag}</td><td className="px-4 py-1.5 font-mono text-stainless">{n.plcAddress}</td><td className="px-4 py-1.5">{n.label}</td><td className="px-4 py-1.5"><Badge tone={s?.source === "DEMO" ? "warn" : "ok"}>{s?.source ?? "–"}</Badge></td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
