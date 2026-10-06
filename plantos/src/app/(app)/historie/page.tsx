"use client";

import { useState } from "react";
import { MACHINES } from "@/lib/plants";
import { usePoll } from "@/lib/client/usePoll";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TrendChart } from "@/components/charts/TrendChart";
import { RcaPanel } from "../anlagen/[id]/MachineDetail";
import { dateTimeDe, timeDe, de } from "@/lib/format";

type Hist = { hours: number; method: string; points: Record<string, number>[]; windows: { signal: string; from: number; to: number; peak: number; z: number }[] };
const SIG: Record<string, string> = { temperatureC: "Temperatur", motorCurrentA: "Motorstrom", vibrationMmS: "Vibration", rejectRatePct: "Ausschuss" };

export default function HistoriePage() {
  const [id, setId] = useState("m-af12");
  const [hours, setHours] = useState(6);
  const { data } = usePoll<Hist>(`/api/machines/${id}/history?hours=${hours}`, 60_000);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Analyse" title="Historie" subtitle="Zeitreihen · Heuristik-Fenster · kein Cloud-Analytics"
        actions={<>
          <select value={id} onChange={(e) => setId(e.target.value)} className="input-industrial min-h-9 text-[13px]" aria-label="Anlage">{MACHINES.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}</select>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="input-industrial min-h-9 text-[13px]" aria-label="Zeitraum">{[1, 6, 12, 24].map((h) => <option key={h} value={h}>{h} h</option>)}</select>
        </>} />
      <div className="grid gap-4">
        <Card title="Temperatur & Strom" action={data && <Badge tone={data.windows.length ? "warn" : "ok"}>{data.windows.length} Anomalie-Fenster</Badge>}>
          {data ? <TrendChart height={220} data={data.points} bands={data.windows.map((w) => ({ from: w.from, to: w.to + 60_000 }))} series={[{ key: "temperatureC", label: "Temperatur", color: "#c9a227", unit: "°C" }, { key: "motorCurrentA", label: "Strom", color: "#5a8fa3", unit: "A" }]} /> : <div className="h-[220px] animate-pulse" />}
        </Card>
        <Card title="Anomalie-Fenster" padded={false}>
          {!data?.windows.length ? <p className="p-4 text-[13px] text-muted">Keine Auffälligkeiten im Zeitraum.</p> : (
            <ul className="divide-y divide-hairline">
              {data.windows.slice(0, 12).map((w, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-2 text-[13px]">
                  <Badge tone="warn">{SIG[w.signal] ?? w.signal}</Badge>
                  <span className="tabular-nums">{dateTimeDe(w.from)}–{timeDe(w.to)}</span>
                  <span className="ml-auto text-[12px] text-muted tabular-nums">Spitze {de(w.peak, 2)} · z {de(w.z)}</span>
                </li>
              ))}
            </ul>
          )}
          {data && <p className="px-4 py-2 text-[11px] text-stainless-dim">Methode: {data.method}</p>}
        </Card>
        <RcaPanel machineId={id} canWrite />
      </div>
    </div>
  );
}
