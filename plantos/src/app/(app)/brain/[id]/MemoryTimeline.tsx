"use client";

import { useState } from "react";
import { usePoll, postJson } from "@/lib/client/usePoll";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MEMORY_LABEL, OPERATOR_TYPES, type MemoryEntry, type MemoryType } from "@/lib/memory/model";

type E = MemoryEntry & { typeLabel: string; assetName?: string; assetPath: string };
const WRITE_TYPES: MemoryType[] = ["fault", "disturbance", "cause", "repair", "partReplacement", "technicianComment", "photo", "measurementSnapshot", "productionParameter", "plcChange", "maintenance", "outcome"];

export function MemoryTimeline({ assetId, perms }: { assetId: string; perms: { comment: boolean; write: boolean; confirm: boolean } }) {
  const { data, reload } = usePoll<{ entries: E[] }>(`/api/memory?assetId=${encodeURIComponent(assetId)}&descendants=1&limit=200`, 60_000);
  const allowed = WRITE_TYPES.filter((t) => (OPERATOR_TYPES.includes(t) ? perms.comment : t === "maintenance" || t === "outcome" ? perms.confirm : perms.write));
  const [type, setType] = useState<MemoryType>("technicianComment");
  const [desc, setDesc] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [material, setMaterial] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<MemoryType | "">("");

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setMsg("Foto größer als 2 MB"); return; }
    const r = new FileReader();
    r.onload = () => setPhoto(String(r.result));
    r.readAsDataURL(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const meta: Record<string, unknown> = {};
      if (type === "partReplacement" && material) meta.sapMaterial = material;
      if (type === "outcome") meta.verified = false;
      await postJson("/api/memory", { assetId, type, description: desc, meta, photoDataUrl: type === "photo" ? photo : undefined });
      setDesc(""); setPhoto(null); setMaterial("");
      setMsg("Gespeichert (unveränderbar, Korrekturen als neuer Eintrag).");
      reload();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const entries = (data?.entries ?? []).filter((e) => !filter || e.type === filter);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
      <Card title="Industrial Memory" action={
        <select value={filter} onChange={(e) => setFilter(e.target.value as MemoryType | "")} className="input-industrial min-h-8 py-1 text-[12px]" aria-label="Typ filtern">
          <option value="">alle Typen</option>{Object.entries(MEMORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>} padded={false}>
        {!data ? <div className="h-40 animate-pulse" /> : entries.length === 0 ? <p className="p-4 text-[13px] text-muted">Keine Einträge.</p> : (
          <ol className="divide-y divide-hairline">
            {entries.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <Badge tone={e.type === "fault" ? "fault" : e.type === "aiRecommendation" ? "accent" : e.type === "outcome" ? "ok" : "muted"}>{e.typeLabel}</Badge>
                  <span className="text-muted tabular-nums">{new Date(e.at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" })}</span>
                  <span className="text-muted">· {e.actor} · {e.source}</span>
                  {e.demo && <Badge tone="warn">DEMO</Badge>}
                  {typeof e.confidence === "number" && <Badge tone="accent">Confidence {Math.round(e.confidence * 100)} %</Badge>}
                  {e.supersedes && <Badge>Korrektur</Badge>}
                </div>
                <p className="mt-1 text-[13px]">{e.description}</p>
                <div className="mt-0.5 text-[11px] text-stainless-dim">{e.assetPath}{e.links.ticketId ? ` · Ticket ${e.links.ticketId}` : ""}{e.links.alarmId ? ` · Alarm ${e.links.alarmId}` : ""}{e.links.sapRef ? ` · SAP ${e.links.sapRef}` : ""}</div>
                {e.media && <img src={`/api/memory/media/${e.media.file}`} alt={e.description} className="mt-2 max-h-48 rounded border border-hairline" loading="lazy" />}
                {Object.keys(e.meta).filter((k) => k !== "signature" && k !== "roi").length > 0 && (
                  <details className="mt-1 text-[11px] text-muted"><summary className="min-h-8 py-1">Metadaten</summary><pre className="overflow-x-auto whitespace-pre-wrap font-mono">{JSON.stringify(Object.fromEntries(Object.entries(e.meta).filter(([k]) => k !== "roi")), null, 1)}</pre></details>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
      {allowed.length > 0 && (
        <Card title="Eintrag erfassen">
          <form onSubmit={submit} className="space-y-2.5">
            <select value={type} onChange={(e) => setType(e.target.value as MemoryType)} className="input-industrial min-h-11 w-full text-[13px] sm:min-h-9" aria-label="Typ">
              {allowed.map((t) => <option key={t} value={t}>{MEMORY_LABEL[t]}</option>)}
            </select>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} maxLength={4000} required minLength={3} placeholder="Beschreibung (was, wo, Befund, Maßnahme)" className="input-industrial w-full text-[13px]" aria-label="Beschreibung" />
            {type === "partReplacement" && <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="SAP-Material (z. B. 4711)" className="input-industrial min-h-11 w-full text-[13px] sm:min-h-9" />}
            {type === "photo" && <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} className="block w-full text-[12px] text-muted file:mr-2 file:min-h-9 file:rounded file:border file:border-border file:bg-surface-elevated file:px-3 file:text-foreground" />}
            <Button variant="primary" disabled={busy || desc.trim().length < 3 || (type === "photo" && !photo)} className="w-full">Speichern</Button>
            {msg && <p className="text-[12px] text-accent">{msg}</p>}
            <p className="text-[11px] text-stainless-dim">Einträge sind unveränderbar und werden mit Benutzer und Zeit protokolliert.</p>
          </form>
        </Card>
      )}
    </div>
  );
}
