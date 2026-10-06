"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

type Opt = { id: string; name: string; typeLabel: string; depth: number };

/** Werk-/Ebenen-Wechsler (Multi-Site). Native <select> – funktioniert auf dem iPhone ohne Hover. */
export function ScopeSwitcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [opts, setOpts] = useState<Opt[]>([]);
  const [cur, setCur] = useState("");
  const [demo, setDemo] = useState(true);
  const [pending, start] = useTransition();
  useEffect(() => {
    fetch("/api/scope").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { setOpts(j.options); setCur(j.current); setDemo(j.demo); } }).catch(() => {});
  }, []);
  if (!opts.length) return null;
  return (
    <label className={`flex items-center gap-1.5 ${compact ? "" : "w-full"}`}>
      <Building2 size={14} className="shrink-0 text-accent" aria-hidden />
      <span className="sr-only">Werk / Ebene</span>
      <select
        value={cur}
        disabled={pending}
        onChange={async (e) => {
          const v = e.target.value;
          setCur(v);
          await fetch("/api/scope", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: v }) });
          start(() => router.refresh());
          window.dispatchEvent(new CustomEvent("plantos:scope", { detail: v }));
        }}
        className="input-industrial min-h-9 w-full min-w-0 py-1 text-[12px]"
      >
        {opts.map((o) => <option key={o.id} value={o.id}>{"  ".repeat(o.depth)}{o.name} · {o.typeLabel}</option>)}
      </select>
      {demo && <span className="badge-industrial shrink-0 text-status-warn">DEMO</span>}
    </label>
  );
}
