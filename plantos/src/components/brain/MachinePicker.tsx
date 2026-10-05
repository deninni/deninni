"use client";

import { useEffect, useState } from "react";
import { useScopeKey } from "@/lib/client/useScope";

/** Maschinenauswahl im aktuellen Scope (aus dem Plant Brain). */
export function MachinePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [opts, setOpts] = useState<{ id: string; code?: string; path: string }[]>([]);
  const k = useScopeKey();
  useEffect(() => {
    fetch(`/api/brain/nodes?type=machine&limit=200&k=${k}`).then((r) => r.json()).then((j) => {
      setOpts(j.results);
      if (j.results.length && !j.results.some((x: { id: string }) => x.id === value)) onChange(j.results[0].id);
    }).catch(() => {});
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input-industrial min-h-11 max-w-full text-[13px] sm:min-h-9" aria-label="Maschine">
      {opts.map((o) => <option key={o.id} value={o.id}>{o.path}</option>)}
    </select>
  );
}
