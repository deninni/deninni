"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/client/usePoll";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { RelationGraph } from "./RelationGraph";
import { MemoryTimeline } from "./MemoryTimeline";
import { PredictionCard } from "@/components/brain/PredictionCard";
import { SimilarCases } from "@/components/brain/SimilarCases";
import { QualityPanel } from "@/components/brain/QualityPanel";
import { EnergyPanel } from "@/components/brain/EnergyPanel";

type Rel = { edgeId: string; type: string; label: string; dir: "in" | "out"; source: string; node: { id: string; type: string; typeLabel: string; name: string; code?: string } };
type Detail = {
  node: { id: string; type: string; typeLabel: string; name: string; code?: string; props: Record<string, unknown>; source: string; createdAt: string };
  path: string;
  ancestors: { id: string; typeLabel: string; name: string }[];
  children: { id: string; typeLabel: string; name: string; code?: string; childCount: number }[];
  relations: Rel[];
  machineId: string | null;
  memoryCount: number;
  spareParts: { id: string; name: string; code?: string; props: Record<string, unknown> }[];
};

type Tab = "overview" | "history" | "predict" | "similar" | "quality" | "energy";

export function AssetDetail({ id, perms }: { id: string; perms: { comment: boolean; write: boolean; confirm: boolean } }) {
  const { data, error } = usePoll<Detail>(`/api/brain/nodes/${encodeURIComponent(id)}`, 60_000);
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => setTab("overview"), [id]);
  if (error) return <p className="text-[13px] text-status-fault">Asset nicht gefunden.</p>;
  if (!data) return <div className="card h-40 animate-pulse" />;
  const n = data.node;
  const hasMachine = !!data.machineId;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Übersicht" },
    { id: "history", label: `Historie (${data.memoryCount})` },
    ...(hasMachine ? ([{ id: "predict", label: "Prognose" }, { id: "similar", label: "Ähnliche Fälle" }, { id: "quality", label: "Qualität" }, { id: "energy", label: "Energie" }] as { id: Tab; label: string }[]) : []),
  ];
  const props = Object.entries(n.props).filter(([, v]) => v != null && typeof v !== "object");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <nav className="flex flex-wrap items-center gap-1 text-[12px] text-muted" aria-label="Pfad">
        <Link href="/brain" className="hover:text-foreground">Plant Brain</Link>
        {[...data.ancestors].reverse().map((a) => <span key={a.id} className="flex items-center gap-1">›<Link href={`/brain/${encodeURIComponent(a.id)}`} className="hover:text-foreground">{a.name}</Link></span>)}
      </nav>
      <PageHeader eyebrow={n.typeLabel} title={n.name} subtitle={n.code ? `${n.code} · ${data.path}` : data.path}
        actions={<><Badge>{n.source === "demo" ? "Quelle DEMO" : `Quelle ${n.source}`}</Badge>{n.source === "demo" && <DemoBadge />}</>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card title="Beziehungen" padded={false}>
            <RelationGraph center={{ id: n.id, name: n.name, typeLabel: n.typeLabel }} parent={data.ancestors[0]} children={data.children} relations={data.relations} />
            <ul className="divide-y divide-hairline border-t border-hairline text-[12px]">
              {data.relations.map((r) => (
                <li key={r.edgeId} className="flex min-h-10 flex-wrap items-center gap-2 px-4 py-1.5">
                  <span className="text-muted">{r.dir === "out" ? r.label : `← ${r.label}`}</span>
                  <Link href={`/brain/${encodeURIComponent(r.node.id)}`} className="font-medium text-accent hover:underline">{r.node.name}</Link>
                  {r.node.code && <span className="font-mono text-[11px] text-stainless">{r.node.code}</span>}
                  <span className="ml-auto text-[10px] text-muted">{r.node.typeLabel} · {r.source}</span>
                </li>
              ))}
              {!data.relations.length && <li className="px-4 py-2 text-muted">Keine weiteren Beziehungen.</li>}
            </ul>
          </Card>
          <div className="space-y-4">
            {props.length > 0 && (
              <Card title="Stammdaten">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
                  {props.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-all font-mono text-[11px]">{String(v)}</dd></div>)}
                </dl>
              </Card>
            )}
            {data.children.length > 0 && (
              <Card title={`Bestandteile (${data.children.length})`} padded={false}>
                <ul className="divide-y divide-hairline">
                  {data.children.map((c) => (
                    <li key={c.id}><Link href={`/brain/${encodeURIComponent(c.id)}`} className="flex min-h-10 items-center gap-2 px-4 text-[13px] hover:bg-surface-elevated/40"><span>{c.name}</span>{c.code && <span className="font-mono text-[11px] text-stainless-dim">{c.code}</span>}<span className="ml-auto text-[10px] text-muted">{c.typeLabel}</span></Link></li>
                  ))}
                </ul>
              </Card>
            )}
            {data.spareParts.length > 0 && (
              <Card title="Ersatzteile (SAP)" action={<Badge>SAP-Demo-Adapter</Badge>} padded={false}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-left text-[11px] text-muted"><th className="px-4 py-2 font-medium">Teil</th><th className="px-2 py-2 font-medium">Material</th><th className="px-2 py-2 font-medium">Bestand</th><th className="px-4 py-2 font-medium">Lieferzeit</th></tr></thead>
                    <tbody className="divide-y divide-hairline">
                      {data.spareParts.map((s) => {
                        const p = s.props as { stock: number; minStock: number; leadTimeDays: number };
                        return <tr key={s.id}><td className="px-4 py-1.5"><Link href={`/brain/${encodeURIComponent(s.id)}`} className="hover:underline">{s.name}</Link></td><td className="px-2 font-mono">{s.code}</td><td className={`px-2 tabular-nums ${p.stock < p.minStock ? "text-status-fault" : ""}`}>{p.stock} / min {p.minStock}</td><td className="px-4 tabular-nums">{p.leadTimeDays} T.</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
      {tab === "history" && <MemoryTimeline assetId={n.id} perms={perms} />}
      {tab === "predict" && data.machineId && <PredictionCard assetId={data.machineId} />}
      {tab === "similar" && data.machineId && <SimilarCases assetId={data.machineId} />}
      {tab === "quality" && data.machineId && <QualityPanel assetId={data.machineId} />}
      {tab === "energy" && data.machineId && <EnergyPanel assetId={data.machineId} />}
    </div>
  );
}
