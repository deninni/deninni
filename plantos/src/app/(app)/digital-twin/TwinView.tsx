"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MACHINES, getMachine } from "@/lib/plants";
import type { TwinPayload } from "@/lib/twin/health";
import type { Snapshot } from "@/lib/demo/engine";
import { BOTTLE_FORMATS } from "@/lib/twin/physics";
import { usePoll } from "@/lib/client/usePoll";
import { TwinSchematic } from "@/components/twin/TwinSchematic";
import { Badge } from "@/components/ui/Badge";
import { StatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Card";
import { MehrZahlen } from "@/components/ui/MehrZahlen";
import { Kpi } from "@/components/ui/Kpi";
import { RcaPanel } from "../anlagen/[id]/MachineDetail";
import { de } from "@/lib/format";

const TwinCanvas = dynamic(() => import("@/components/twin/scene3d/TwinCanvas"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-[12px] text-muted">3D wird geladen …</div> });

type Mode = "REAL" | "SIMULATION" | "REPLAY";
type TwinResp = TwinPayload & { mode: Mode; signals: Snapshot["signals"] };

export function TwinView() {
  const sp = useSearchParams();
  const router = useRouter();
  const machineId = getMachine(sp.get("machine") ?? "")?.id ?? "m-af12";
  const [mode, setMode] = useState<Mode>("REAL");
  const [view, setView] = useState<"3d" | "2d">("3d");
  const [speedFactor, setSpeedFactor] = useState(1);
  const [format, setFormat] = useState("1.0");
  const [minutesAgo, setMinutesAgo] = useState(30);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSensors, setShowSensors] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [playing, setPlaying] = useState(true);

  const q = new URLSearchParams({ mode, format, speedFactor: String(speedFactor), minutesAgo: String(minutesAgo) });
  const { data: twin, error } = usePoll<TwinResp>(`/api/machines/${machineId}/twin?${q}`, mode === "REPLAY" ? 60_000 : 2000);
  const sel = twin?.components.find((c) => c.id === selected) ?? null;

  const seg = (opts: readonly string[], v: string, set: (x: string) => void, labels?: Record<string, string>) => (
    <div className="inline-flex rounded-md border border-border bg-navy-deep p-0.5">
      {opts.map((o) => (
        <button key={o} onClick={() => set(o)} className={`focus-ring min-h-9 rounded px-2.5 text-[11px] font-medium sm:min-h-7 ${v === o ? "bg-accent-muted text-foreground" : "text-muted hover:text-foreground"}`}>{labels?.[o] ?? o}</button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={machineId} onChange={(e) => { setSelected(null); router.replace(`/digital-twin?machine=${e.target.value}`); }} className="input-industrial min-h-9 text-[13px]" aria-label="Anlage">
          {MACHINES.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
        </select>
        {seg(["REAL", "SIMULATION", "REPLAY"] as const, mode, (x) => setMode(x as Mode))}
        {seg(["3d", "2d"] as const, view, (x) => setView(x as "3d" | "2d"), { "3d": "3D", "2d": "2D" })}
        {twin && <StatusPill state={twin.state} />}
        {twin && <Badge tone={twin.source === "DEMO" ? "warn" : "ok"}>{twin.source}</Badge>}
        {mode === "SIMULATION" && <Badge tone="accent">SIM ×{speedFactor.toFixed(2)}</Badge>}
        <div className="ml-auto flex gap-1.5 text-[11px] text-muted">
          <label className="flex items-center gap-1"><input type="checkbox" checked={showSensors} onChange={(e) => setShowSensors(e.target.checked)} /> Sensoren</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Labels</label>
          <button onClick={() => setPlaying(!playing)} className="focus-ring rounded border border-border px-2">{playing ? "Pause" : "Abspielen"}</button>
        </div>
      </div>

      {mode !== "REAL" && (
        <div className="card flex flex-wrap items-center gap-4 px-4 py-2.5 text-[12px]">
          {mode === "SIMULATION" && (
            <>
              <label className="flex items-center gap-2">Geschwindigkeit ×<input type="range" min={0.5} max={1.4} step={0.05} value={speedFactor} onChange={(e) => setSpeedFactor(Number(e.target.value))} /> <span className="tabular-nums">{speedFactor.toFixed(2)}</span></label>
              <label className="flex items-center gap-2">Format {seg(BOTTLE_FORMATS.map((f) => f.id), format, setFormat, Object.fromEntries(BOTTLE_FORMATS.map((f) => [f.id, f.label])))}</label>
              <span className="text-stainless-dim">Simulation · keine Wirkung auf die Anlage</span>
            </>
          )}
          {mode === "REPLAY" && (
            <label className="flex items-center gap-2">vor <input type="range" min={0} max={240} step={1} value={minutesAgo} onChange={(e) => setMinutesAgo(Number(e.target.value))} /> <span className="tabular-nums">{minutesAgo} min</span><span className="text-stainless-dim">· aus Demo-Engine-Historie</span></label>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="card twin-hero-h overflow-hidden">
          {error && <div className="p-4 text-[12px] text-status-fault">Twin-Daten nicht erreichbar: {error}</div>}
          {twin && (view === "3d"
            ? <TwinCanvas twin={twin} selected={selected} onSelect={(id) => setSelected(id || null)} showSensors={showSensors} showLabels={showLabels} playing={playing} />
            : <div className="h-full p-2"><TwinSchematic twin={twin} selected={selected} onSelect={setSelected} showLabels={showLabels} /></div>)}
        </div>

        <div className="space-y-4">
          <Card title={sel ? "Komponente" : "Anlage"}>
            {sel ? (
              <div className="space-y-2 text-[13px]">
                <div className="font-medium">{sel.label}</div>
                <div className="flex gap-2"><Badge tone={sel.health === "OK" ? "ok" : sel.health === "WARN" ? "warn" : sel.health === "FAULT" ? "fault" : "muted"}>{sel.health}</Badge><Badge>{sel.kind}</Badge></div>
                {sel.plcTag && <div className="font-mono text-[11px] text-[#7eb6c9]">{sel.plcTag} · {sel.plcAddress}</div>}
                {twin?.incident?.component === sel.id && <div className="rounded border border-status-warn/30 bg-status-warn/5 p-2 text-[12px]">{twin.incident.title}</div>}
                <button onClick={() => setSelected(null)} className="text-[12px] text-accent hover:underline">Auswahl aufheben</button>
              </div>
            ) : twin ? (
              <div className="text-[13px]">
                <div className="font-medium">{getMachine(machineId)!.name}</div>
                <div className="mt-1 text-[12px] text-muted">{twin.incident ? twin.incident.title : "Keine aktive Meldung."}</div>
                <div className="kpi-strip mt-3">
                  <Kpi label="Geschwindigkeit" value={de(twin.speedPercent)} unit="%" />
                  <Kpi label="Ausbringung" value={de(twin.signals.outputRate, 0)} unit={getMachine(machineId)!.unit} />
                </div>
                <MehrZahlen>
                  <div className="kpi-strip">
                    <Kpi label="Strom" value={de(twin.signals.motorCurrentA, 2)} unit="A" />
                    <Kpi label="Temperatur" value={de(twin.signals.temperatureC)} unit="°C" />
                    <Kpi label="Vibration" value={de(twin.signals.vibrationMmS, 2)} unit="mm/s" />
                    <Kpi label="TipRisk" value={twin.tipRiskPct} unit="%" />
                  </div>
                </MehrZahlen>
              </div>
            ) : <div className="h-24 animate-pulse" />}
          </Card>
          {mode === "REAL" && <RcaPanel machineId={machineId} canWrite />}
        </div>
      </div>
      <p className="text-[11px] text-stainless-dim">REAL = aktueller Datenstand ({twin?.source ?? "…"}). Ohne frisches Edge-Sample ist das die Demo-Engine – keine Live-SPS. 3D ist eine prozedurale Stilisierung, kein Aufmaß der Kundenanlage.</p>
    </div>
  );
}
