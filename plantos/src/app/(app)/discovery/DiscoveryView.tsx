"use client";

import { useState } from "react";
import Link from "next/link";
import { postJson } from "@/lib/client/usePoll";
import type { DiscoveryImport } from "@/lib/discovery/store";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MachinePicker } from "@/components/brain/MachinePicker";

const FORMATS = [
  { id: "io-csv", label: "IO-Liste (CSV aus Excel)", example: "BMK;Adresse;Typ;Beschreibung\n=SUED+L2-M12;DB12.DBD40;REAL;Motorstrom Förderband\n=SUED+L2-B7;I3.2;BOOL;Lichtschranke Stau\nSollwert_Speed;DB12.DBD48;REAL;(Schreib-Tag – wird abgelehnt)" },
  { id: "eplan-csv", label: "EPLAN Betriebsmittel (CSV)", example: "Betriebsmittelkennzeichen;Funktionstext;Artikelnummer\n=AF24+S1-M-241;Hauptantrieb Füller;1LE1\n=AF24+S1-B12;Temperatur Motor;PT100" },
  { id: "tia", label: "TIA/Step7 Symbolliste", example: "Name;Adresse;Datentyp;Kommentar\nM12;DB12.DBD4;REAL;Motorstrom M12\nVS_M12;DB12.DBD8;REAL;Schwingung M12" },
  { id: "opcua-nodeset", label: "OPC UA NodeSet2 (XML-Export)", example: `<UANodeSet>\n <UAVariable NodeId="ns=2;s=FB03.M12.Current" BrowseName="2:Current" DataType="Double" AccessLevel="1"><DisplayName>Motorstrom M12</DisplayName></UAVariable>\n</UANodeSet>` },
] as const;

export function DiscoveryView({ canImport, canConfirm }: { canImport: boolean; canConfirm: boolean }) {
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("io-csv");
  const [text, setText] = useState<string>(FORMATS[0].example);
  const [scope, setScope] = useState("m-sued-fb03");
  const [imp, setImp] = useState<DiscoveryImport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function analyze() {
    setErr(null); setBusy(true);
    try { setImp((await postJson<{ import: DiscoveryImport }>("/api/discovery", { format, text, scopeId: scope, fileName: "Eingabe" })).import); }
    catch (e) { setErr((e as Error).message); setImp(null); }
    finally { setBusy(false); }
  }
  async function decide(key: string, decision: "confirmed" | "rejected") {
    if (!imp) return;
    try { setImp((await postJson<{ import: DiscoveryImport }>("/api/discovery/confirm", { importId: imp.id, decisions: [{ key, decision }] })).import); }
    catch (e) { setErr((e as Error).message); }
  }
  async function onFile(f?: File) {
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { setErr("Datei größer als 3 MB"); return; }
    setText(await f.text());
  }

  return (
    <div className="space-y-4">
      <Card title="Import">
        {!canImport && <p className="mb-2 text-[12px] text-muted">Import nur für Instandhaltung/Werkleitung.</p>}
        <div className="flex flex-wrap gap-2">
          <select value={format} onChange={(e) => { const f = FORMATS.find((x) => x.id === e.target.value)!; setFormat(f.id); setText(f.example); }} className="input-industrial min-h-11 text-[13px] sm:min-h-9" aria-label="Format">
            {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <MachinePicker value={scope} onChange={setScope} />
          <input type="file" accept=".csv,.txt,.tsv,.xml,.json" onChange={(e) => onFile(e.target.files?.[0])} className="text-[12px] text-muted file:mr-2 file:min-h-9 file:rounded file:border file:border-border file:bg-surface-elevated file:px-3 file:text-foreground" />
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="input-industrial mt-2 w-full font-mono text-[11px]" aria-label="Inhalt" />
        <Button className="mt-2" variant="primary" disabled={!canImport || busy} onClick={analyze}>Analysieren</Button>
        {err && <p className="mt-2 text-[12px] text-status-fault">{err}</p>}
        <p className="mt-2 text-[11px] text-stainless-dim">Excel bitte als CSV speichern. Live-OPC-UA-Browse läuft nur über den Edge-Agenten im OT-Netz (Ergebnis als JSON importierbar) – plantOS scannt keine Netzwerke.</p>
      </Card>
      {imp && (
        <Card title={`Vorschläge (${imp.suggestions.length})`} padded={false}>
          <ul className="divide-y divide-hairline">
            {imp.suggestions.map((s) => (
              <li key={s.candidate.key} className="px-4 py-3 text-[12px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{s.candidate.name}</span>
                  {s.candidate.address && <span className="font-mono text-stainless">{s.candidate.address}</span>}
                  {s.candidate.nodeId && <span className="font-mono text-stainless">{s.candidate.nodeId}</span>}
                  <Badge tone={s.status === "sicher" ? "ok" : s.status === "Vorschlag" ? "accent" : "muted"}>{s.status} · {Math.round(s.confidence * 100)} %</Badge>
                  {s.decision && <Badge tone={s.decision === "confirmed" ? "ok" : "muted"}>{s.decision === "confirmed" ? "übernommen" : "abgelehnt"}</Badge>}
                </div>
                <div className="mt-1 text-muted">{s.candidate.description}{s.assetPath ? <> → <Link href={`/brain/${encodeURIComponent(s.assetId!)}`} className="text-accent hover:underline">{s.assetPath}</Link></> : " → keine Zuordnung"} · {s.reason}</div>
                {canConfirm && !s.decision && s.candidate.valid && s.assetId && (
                  <div className="mt-2 flex gap-2"><Button onClick={() => decide(s.candidate.key, "confirmed")}>Übernehmen</Button><Button variant="ghost" onClick={() => decide(s.candidate.key, "rejected")}>Ablehnen</Button></div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
