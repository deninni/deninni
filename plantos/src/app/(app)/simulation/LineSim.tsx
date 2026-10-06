"use client";

import { useEffect, useState } from "react";
import { postJson } from "@/lib/client/usePoll";
import type { SimInput, SimResult, ValueKind } from "@/lib/simulation/line";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MachinePicker } from "@/components/brain/MachinePicker";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const FIELDS: { key: keyof SimInput; label: string; unit: string; step: number }[] = [
  { key: "beltSpeedMs", label: "Bandgeschwindigkeit", unit: "m/s", step: 0.05 },
  { key: "accelerationMs2", label: "Beschleunigung (Anfahren)", unit: "m/s²", step: 0.1 },
  { key: "productMassKg", label: "Produktmasse", unit: "kg", step: 0.05 },
  { key: "pitchM", label: "Teilung (Abstand)", unit: "m", step: 0.01 },
  { key: "beltLengthM", label: "Bandlänge", unit: "m", step: 1 },
  { key: "frictionCoeff", label: "Reibwert", unit: "µ", step: 0.01 },
  { key: "motorRatedKw", label: "Motor-Nennleistung", unit: "kW", step: 0.25 },
  { key: "bufferCapacity", label: "Pufferkapazität", unit: "Einheiten", step: 50 },
  { key: "fillerCycleS", label: "Taktzeit Füller", unit: "s", step: 0.005 },
  { key: "packerCycleS", label: "Taktzeit Packer", unit: "s", step: 0.005 },
];
const KIND_TONE: Record<ValueKind, "ok" | "accent" | "muted" | "warn"> = { Messwert: "ok", Modellwert: "accent", Annahme: "muted", Simulation: "warn" };

export function LineSim() {
  const [assetId, setAssetId] = useState("m-af12");
  const [input, setInput] = useState<SimInput | null>(null);
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/simulation/line?assetId=${encodeURIComponent(assetId)}`).then((r) => r.json()).then((j) => { setInput(j.input); setRes(j.result); });
  }, [assetId]);
  async function run() {
    if (!input) return;
    setBusy(true);
    try { setRes((await postJson<{ result: SimResult }>("/api/simulation/line", { input, assetId })).result); } finally { setBusy(false); }
  }
  if (!input || !res) return <div className="card h-48 animate-pulse" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card title="Parameter" action={<MachinePicker value={assetId} onChange={setAssetId} />}>
        <div className="space-y-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[12px]">
              <span><span className="text-muted">{f.label}</span> <Badge tone={KIND_TONE[res.inputs[f.key].kind]}>{res.inputs[f.key].kind}</Badge></span>
              <span className="flex items-center gap-1"><input type="number" step={f.step} value={input[f.key] as number} onChange={(e) => setInput({ ...input, [f.key]: Number(e.target.value) })} className="input-industrial min-h-9 w-24 py-1 text-right tabular-nums" /><span className="w-10 text-[10px] text-muted">{f.unit}</span></span>
            </label>
          ))}
          <label className="grid grid-cols-[1fr_auto] items-center gap-2 text-[12px]"><span className="text-muted">Flaschenformat</span>
            <select value={input.bottleFormat} onChange={(e) => setInput({ ...input, bottleFormat: e.target.value })} className="input-industrial min-h-9 py-1 text-[12px]">{["0.5", "1.0", "1.25", "1.5"].map((f) => <option key={f} value={f}>{f.replace(".", ",")} L</option>)}</select>
          </label>
          <Button variant="primary" className="w-full" onClick={run} disabled={busy}>{busy ? "Rechne …" : "Neu berechnen"}</Button>
          <p className="text-[11px] text-stainless-dim">Messwert = aktueller Wert der Maschine (serverseitig geprüft). Wird er geändert, ist es eine Simulationsannahme.</p>
        </div>
      </Card>
      <div className="space-y-4">
        {res.warnings.length > 0 && <div className="card border-status-warn/40 p-3 text-[12px]">{res.warnings.map((w) => <div key={w}>⚠ {w}</div>)}</div>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Object.entries(res.outputs).map(([k, o]) => (
            <div key={k} className="card p-3"><div className="label-section">{o.label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{o.value.toLocaleString("de-DE")}<span className="ml-1 text-[11px] font-normal text-muted">{o.unit}</span></div><Badge tone="warn">Simulation</Badge></div>
          ))}
        </div>
        <Card title="Puffer über die Zeit (Simulation)">
          <div className="h-48">
            <ResponsiveContainer>
              <AreaChart data={res.timeline} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(180,190,204,0.07)" vertical={false} />
                <XAxis dataKey="minute" tick={{ fill: "#8b93a0", fontSize: 10 }} stroke="#1c2430" unit=" min" />
                <YAxis tick={{ fill: "#8b93a0", fontSize: 10 }} stroke="#1c2430" />
                <Tooltip contentStyle={{ background: "#11161e", border: "1px solid #1c2430", fontSize: 11 }} />
                <Area dataKey="buffer" name="Puffer" stroke="#5a8fa3" fill="rgba(90,143,163,.25)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <p className="text-[11px] text-stainless-dim">{res.disclaimer}</p>
      </div>
    </div>
  );
}
