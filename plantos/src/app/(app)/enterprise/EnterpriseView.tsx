"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePoll, postJson } from "@/lib/client/usePoll";
import { useScopeKey } from "@/lib/client/useScope";
import type { ScopeKpis } from "@/lib/enterprise/rollup";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { NODE_LABEL, type NodeType } from "@/lib/graph/model";

type Ent = { scope: ScopeKpis; path: { id: string; name: string; typeLabel: string }[]; tenant: { name: string; demo: boolean } };

function Row({ c, depth, onOpen }: { c: ScopeKpis; depth: number; onOpen: (id: string) => void }) {
  return (
    <tr className="hover:bg-surface-elevated/40">
      <td className="px-4 py-2" style={{ paddingLeft: 16 + depth * 14 }}>
        {c.type === "machine" ? <Link href={`/brain/${encodeURIComponent(c.id)}`} className="hover:underline">{c.name}</Link> : <button onClick={() => onOpen(c.id)} className="focus-ring min-h-9 text-left text-accent hover:underline">{c.name}</button>}
        <div className="text-[10px] text-muted">{NODE_LABEL[c.type as NodeType]} · {c.machines} Masch.</div>
      </td>
      <td>{c.oeePct.toLocaleString("de-DE")} %</td><td>{c.availabilityPct.toLocaleString("de-DE")} %</td><td>{c.stopMinutes24h}</td>
      <td>{c.predictiveAlerts ? <Badge tone="warn">{c.predictiveAlerts}</Badge> : 0}</td><td>{c.maintenanceDue14d}</td>
      <td className={c.sparePartsBelowMin ? "text-status-fault" : ""}>{c.sparePartsBelowMin}</td><td>{c.qualityPct.toLocaleString("de-DE")} %</td>
      <td>{Math.round(c.energyKwh24h).toLocaleString("de-DE")}</td><td className="px-4">{c.valueRealized ? `${c.valueRealized.toLocaleString("de-DE")} €` : "–"}</td>
    </tr>
  );
}

export function EnterpriseView({ initialScope, isAdmin }: { initialScope?: string; isAdmin: boolean }) {
  const k = useScopeKey();
  const [scope, setScope] = useState<string | undefined>(initialScope);
  useEffect(() => setScope(undefined), [k]);
  const { data } = usePoll<Ent>(`/api/enterprise?depth=2${scope ? `&scope=${encodeURIComponent(scope)}` : ""}&k=${k}`, 300_000);
  const tenant = usePoll<{ tenant: { crossPlantLearning: boolean } }>("/api/tenant", 600_000);
  const s = data?.scope;
  return (
    <div className="space-y-4">
      {data && (
        <nav className="flex flex-wrap items-center gap-1 text-[12px] text-muted" aria-label="Ebenen">
          {data.path.map((p) => <span key={p.id} className="flex items-center gap-1"><button onClick={() => setScope(p.id)} className="min-h-9 hover:text-foreground">{p.name}</button>›</span>)}
          <span className="text-foreground">{s?.name}</span>{data.tenant.demo && <DemoBadge label="DEMO-Struktur" />}
        </nav>
      )}
      <Card padded={false}>
        {!s ? <div className="h-48 animate-pulse" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[12px] tabular-nums">
              <thead><tr className="text-left text-[11px] text-muted"><th className="px-4 py-2 font-medium">Einheit</th><th className="font-medium">OEE</th><th className="font-medium">Verfügb.</th><th className="font-medium">Stopp min 24h</th><th className="font-medium">Pred.-Alerts</th><th className="font-medium">Wartung ≤14T</th><th className="font-medium">Teile &lt; Min</th><th className="font-medium">Qualität</th><th className="font-medium">kWh 24h</th><th className="px-4 font-medium">Wert (real.)</th></tr></thead>
              <tbody className="divide-y divide-hairline">
                <Row c={s} depth={0} onOpen={setScope} />
                {s.children.flatMap((c) => [<Row key={c.id} c={c} depth={1} onOpen={setScope} />, ...c.children.map((cc) => <Row key={cc.id} c={cc} depth={2} onOpen={setScope} />)])}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Cross-Plant Learning (Mandanten-Einstellung)">
        <p className="text-[12px] text-muted">Vergleich historischer Fehler über Werke hinweg – nur innerhalb dieses Mandanten, kein Modelltraining über Mandantengrenzen.</p>
        <div className="mt-2 flex items-center gap-3 text-[13px]">
          <Badge tone={tenant.data?.tenant.crossPlantLearning ? "ok" : "muted"}>{tenant.data?.tenant.crossPlantLearning ? "freigegeben" : "deaktiviert"}</Badge>
          {isAdmin && tenant.data && <button className="focus-ring min-h-9 rounded-md border border-border px-3 text-[12px]" onClick={async () => { await postJson("/api/tenant", { crossPlantLearning: !tenant.data!.tenant.crossPlantLearning }, "PATCH"); tenant.reload(); }}>{tenant.data.tenant.crossPlantLearning ? "Deaktivieren" : "Freigeben"}</button>}
        </div>
      </Card>
    </div>
  );
}
