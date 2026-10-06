"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { NODE_LABEL, type NodeType } from "@/lib/graph/model";

type TreeNode = { id: string; type: NodeType; typeLabel: string; name: string; code?: string; childCount: number };
type Hit = { id: string; type: NodeType; typeLabel: string; name: string; code?: string; path: string; source: string };

const FILTERS: NodeType[] = ["plant", "line", "machine", "component", "sensor", "plcTag", "sparePart", "document", "sapEquipment", "alarm", "ticket"];

function TreeRow({ n, depth }: { n: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const [kids, setKids] = useState<TreeNode[] | null>(null);
  const load = useCallback(async () => {
    if (kids) return;
    const r = await fetch(`/api/brain/tree?root=${encodeURIComponent(n.id)}`);
    if (r.ok) setKids((await r.json()).children);
  }, [kids, n.id]);
  useEffect(() => { if (open) load(); }, [open, load]);
  return (
    <li>
      <div className="flex items-center gap-1" style={{ paddingLeft: depth * 14 }}>
        {n.childCount > 0 ? (
          <button onClick={() => setOpen(!open)} className="focus-ring grid min-h-9 min-w-9 place-items-center text-muted" aria-label={open ? "Zuklappen" : "Aufklappen"} aria-expanded={open}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : <span className="min-w-9" />}
        <Link href={`/brain/${encodeURIComponent(n.id)}`} className="focus-ring flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded px-1 text-[13px] hover:bg-surface-elevated">
          <span className="truncate">{n.name}</span>
          {n.code && n.code !== n.name && <span className="shrink-0 font-mono text-[11px] text-stainless-dim">{n.code}</span>}
          <span className="ml-auto shrink-0 text-[10px] text-muted">{n.typeLabel}</span>
        </Link>
      </div>
      {open && kids && <ul>{kids.map((k) => <TreeRow key={k.id} n={k} depth={depth + 1} />)}</ul>}
    </li>
  );
}

export function BrainExplorer() {
  const [root, setRoot] = useState<TreeNode | null>(null);
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<NodeType[]>([]);
  const [hits, setHits] = useState<Hit[] | null>(null);

  useEffect(() => {
    fetch("/api/brain/tree").then((r) => r.json()).then((j) => setRoot({ ...j.root, childCount: j.children.length }));
  }, []);

  useEffect(() => {
    if (!q.trim() && !types.length) { setHits(null); return; }
    const c = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/brain/nodes?q=${encodeURIComponent(q)}&type=${types.join(",")}&limit=80`, { signal: c.signal }).then((r) => r.json()).then((j) => setHits(j.results)).catch(() => {});
    }, 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [q, types]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Anlagenbaum" action={<DemoBadge />} padded={false}>
        <ul className="max-h-[70vh] overflow-y-auto p-2">{root && <TreeRow n={root} depth={0} />}</ul>
      </Card>
      <Card title="Suche & Filter">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="z. B. M12, Lager, DB12, 4711, Werk Süd" className="input-industrial min-h-11 w-full pl-8 text-[13px] sm:min-h-9" aria-label="Suche im Plant Brain" />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setTypes((t) => (t.includes(f) ? t.filter((x) => x !== f) : [...t, f]))}
              className={`focus-ring min-h-8 rounded-full border px-2.5 text-[11px] ${types.includes(f) ? "border-accent-border bg-accent-muted text-foreground" : "border-border text-muted"}`}>{NODE_LABEL[f]}</button>
          ))}
        </div>
        <div className="mt-3">
          {hits == null ? <p className="text-[12px] text-muted">Suchbegriff eingeben oder Typ wählen.</p> : hits.length === 0 ? <p className="text-[12px] text-muted">Keine Treffer.</p> : (
            <ul className="divide-y divide-hairline">
              {hits.map((h) => (
                <li key={h.id}>
                  <Link href={`/brain/${encodeURIComponent(h.id)}`} className="focus-ring block min-h-11 py-2 hover:bg-surface-elevated/40">
                    <div className="flex items-center gap-2 text-[13px]"><span className="truncate font-medium">{h.name}</span>{h.code && <span className="font-mono text-[11px] text-stainless">{h.code}</span>}<span className="ml-auto"><Badge>{h.typeLabel}</Badge></span></div>
                    <div className="truncate text-[11px] text-muted">{h.path}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
