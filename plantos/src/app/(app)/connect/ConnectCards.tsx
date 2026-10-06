"use client";

import { useState } from "react";
import { usePoll, postJson } from "@/lib/client/usePoll";
import type { EdgePlantStatus } from "@/lib/plc/edge-state";
import type { SymbolParseResult } from "@/lib/plc/symbol-list";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MehrZahlen } from "@/components/ui/MehrZahlen";
import { MACHINES } from "@/lib/plants";

const TONE = { frisch: "ok", verzögert: "warn", veraltet: "fault", "kein Edge": "muted" } as const;

export function EdgePlantsCard() {
  const { data } = usePoll<{ plants: EdgePlantStatus[] }>("/api/edge/plants", 5000);
  return (
    <Card title="Edge je Anlage" padded={false}>
      <ul className="divide-y divide-hairline">
        {(data?.plants ?? []).map((p) => (
          <li key={p.machineId} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
            <span className="font-medium">{p.code}</span><span className="text-muted">{p.name}</span>
            <span className="ml-auto"><Badge tone={TONE[p.freshness]}>{p.freshness}</Badge></span>
          </li>
        ))}
      </ul>
      <div className="px-4 pb-3">
        <MehrZahlen>
          <table className="w-full text-[12px]">
            <thead><tr className="text-left text-muted"><th className="font-medium">Anlage</th><th className="font-medium">Agent</th><th className="font-medium">Herkunft</th><th className="font-medium">Alter</th><th className="font-medium">Tags</th></tr></thead>
            <tbody>{(data?.plants ?? []).map((p) => <tr key={p.machineId}><td>{p.code}</td><td className="font-mono">{p.agentId ?? "–"}</td><td>{p.origin ?? "–"}</td><td>{p.ageS != null ? `${p.ageS} s` : "–"}</td><td>{p.tagCount}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-[11px] text-stainless-dim">frisch = Sample ≤ 15 s · verzögert = Heartbeat ≤ 60 s · ohne Edge zeigt plantOS DEMO-Werte.</p>
        </MehrZahlen>
      </div>
    </Card>
  );
}

const EXAMPLE = `Name;Adresse;Datentyp;Kommentar;Anlage
M1;DB10.DBD4;REAL;Motorstrom Hauptantrieb;AF-12
B1;I2.1;BOOL;Lichtschranke LS-17;AF-12
PT100;DB20.DBD0;REAL;Tunneltemperatur;VL-3
M3;DB30.DBD4;REAL;Antrieb A3 Strom;FT-7`;

export function SymbolListCard() {
  const [text, setText] = useState(EXAMPLE);
  const [multi, setMulti] = useState(true);
  const [machineId, setMachineId] = useState("m-af12");
  const [res, setRes] = useState<SymbolParseResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function preview() {
    setErr(null);
    try { setRes(await postJson<SymbolParseResult>("/api/symbol-list", { text, multi, machineId })); } catch (e) { setErr((e as Error).message); setRes(null); }
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { setErr("Datei größer als 3 MB"); return; }
    setText(await f.text());
  }

  return (
    <Card title="SPS-Symbolliste (Textimport)" action={<Badge>kein TIA-Online · kein OCR</Badge>}>
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Mehrere Anlagen (Spalte „Anlage“)</label>
        {!multi && <select className="input-industrial min-h-8 py-1 text-[12px]" value={machineId} onChange={(e) => setMachineId(e.target.value)}>{MACHINES.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}</select>}
        <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => onFile(e.target.files?.[0])} className="text-[12px] text-muted file:mr-2 file:rounded file:border file:border-border file:bg-surface-elevated file:px-2 file:py-1 file:text-foreground" />
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="input-industrial mt-3 w-full font-mono text-[11px]" aria-label="Symbolliste" />
      <Button className="mt-2" variant="primary" onClick={preview}>Vorschau</Button>
      {err && <p className="mt-2 text-[12px] text-status-fault">{err}</p>}
      {res && (
        <div className="mt-3">
          <div className="flex gap-2"><Badge tone="ok">{res.validCount} gültig</Badge>{res.invalidCount > 0 && <Badge tone="fault">{res.invalidCount} ungültig</Badge>}</div>
          <table className="mt-2 w-full text-[12px]">
            <thead><tr className="text-left text-muted"><th className="font-medium">Z.</th><th className="font-medium">Name</th><th className="font-medium">Adresse</th><th className="font-medium">Typ</th><th className="font-medium">Anlage</th><th className="font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-hairline">
              {res.rows.map((r) => (
                <tr key={r.line} className={r.valid ? "" : "text-status-fault"}>
                  <td className="py-1">{r.line}</td><td className="font-mono">{r.name}</td><td className="font-mono">{r.address}</td><td>{r.dataType}</td><td>{MACHINES.find((m) => m.id === r.machineId)?.code ?? "–"}</td><td>{r.valid ? "ok" : r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-stainless-dim">{res.honesty}. Ungültige Zeilen bleiben sichtbar, werden aber nicht übernommen.</p>
        </div>
      )}
    </Card>
  );
}
