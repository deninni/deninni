"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Kpi } from "@/components/ui/Kpi";
import { MehrZahlen } from "@/components/ui/MehrZahlen";
import { BOTTLE_FORMATS, computePhysics, maxSafeSpeed } from "@/lib/twin/physics";
import { de } from "@/lib/format";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";

export default function SimulationPage() {
  const [speed, setSpeed] = useState(86);
  const [fmt, setFmt] = useState("1.0");
  const r = computePhysics(speed, fmt);
  const curve = useMemo(() => Array.from({ length: 25 }, (_, i) => {
    const s = i * 5;
    const row: Record<string, number> = { s };
    for (const f of BOTTLE_FORMATS) row[f.id] = computePhysics(s, f.id).tipRiskPct;
    return row;
  }), []);
  const tone = r.verdict === "kritisch" ? "fault" : r.verdict === "beobachten" ? "warn" : "ok";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Analyse · AF-12" title="Simulation" subtitle="Geschwindigkeit + Flaschenformat → Massen-/Kipp-Auswirkungen (DEMO-Heuristik)" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="Eingaben">
          <label className="block text-[12px]"><span className="label-section">Geschwindigkeit</span>
            <input type="range" min={20} max={120} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="mt-2 w-full" />
            <span className="tabular-nums">{speed} %</span>
          </label>
          <div className="mt-4"><span className="label-section">Format</span>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {BOTTLE_FORMATS.map((f) => <button key={f.id} onClick={() => setFmt(f.id)} className={`focus-ring min-h-9 rounded border text-[12px] ${fmt === f.id ? "border-accent-border bg-accent-muted" : "border-border text-muted"}`}>{f.label}</button>)}
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2"><Badge tone={tone}>{r.verdict}</Badge><span className="text-[12px] text-muted">TipRisk {r.tipRiskPct} %</span></div>
          <p className="mt-2 text-[12px] text-muted">Empfohlene Höchstgeschwindigkeit für {r.format.label}: <span className="text-foreground tabular-nums">{maxSafeSpeed(fmt)} %</span></p>
          <p className="mt-4 text-[11px] text-stainless-dim">Simulation · keine Wirkung auf die Anlage · Sollwerte setzt nur der Mensch an der Bedienung.</p>
        </Card>
        <Card title="Kipprisiko je Format über Geschwindigkeit">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={curve} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(180,190,204,0.07)" vertical={false} />
                <XAxis dataKey="s" tick={{ fill: "#8b93a0", fontSize: 10 }} stroke="#1c2430" unit="%" />
                <YAxis tick={{ fill: "#8b93a0", fontSize: 10 }} stroke="#1c2430" unit="%" domain={[0, 60]} />
                <Tooltip contentStyle={{ background: "#11161e", border: "1px solid #1c2430", fontSize: 11 }} />
                <ReferenceLine y={25} stroke="#c9a227" strokeDasharray="4 4" />
                <ReferenceLine x={Math.round(speed / 5) * 5} stroke="#5a8fa3" />
                {BOTTLE_FORMATS.map((f, i) => <Line key={f.id} dataKey={f.id} name={f.label} dot={false} isAnimationActive={false} stroke={["#7eb6c9", "#5a8fa3", "#3d7a8f", "#c9a227"][i]} strokeWidth={f.id === fmt ? 2.4 : 1.1} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <MehrZahlen>
            <div className="kpi-strip">
              <Kpi label="Bandgeschw." value={de(r.lineSpeedMs, 2)} unit="m/s" />
              <Kpi label="Zentripetal" value={de(r.centripetalMs2, 2)} unit="m/s²" />
              <Kpi label="Flaschen" value={r.bottlesPerMin} unit="Fl/min" />
              <Kpi label="Massenstrom" value={de(r.massFlowKgMin)} unit="kg/min" />
            </div>
            <p className="mt-2 text-[11px] text-stainless-dim">Modell: a = v²/r am Sternrad (r = 0,36 m), Kippmoment a·h_s gegen g·d/2, Führungsgeländer nimmt ~81 % auf (Annahme). Nicht zertifiziert.</p>
          </MehrZahlen>
        </Card>
      </div>
    </div>
  );
}
