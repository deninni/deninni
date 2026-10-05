import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { WRITE_GUARD_HONESTY } from "@/lib/brand";
import { EdgePlantsCard, SymbolListCard } from "./ConnectCards";

export const metadata = { title: "Connect" };

export default function ConnectPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader eyebrow="System" title="Connect" subtitle="SPS-Anbindung über Edge-Agent im Werksnetz · nur Lesen" />
      <div className="card flex flex-wrap items-center gap-3 border-status-ok/30 px-4 py-3">
        <Badge tone="ok">Schreibschutz aktiv</Badge>
        <span className="text-[12px] text-muted">{WRITE_GUARD_HONESTY}</span>
      </div>
      <EdgePlantsCard />
      <SymbolListCard />
      <Card title="Architektur (Pilot)">
        <ol className="space-y-2 text-[13px]">
          <li><span className="font-medium">1 · SPS</span> <span className="text-muted">(S7-1500/1200, später OPC UA) – bleibt unverändert, keine Programmänderung.</span></li>
          <li><span className="font-medium">2 · Edge-Agent</span> <span className="text-muted">auf IPC/Raspberry Pi im OT-Netz, liest zyklisch, nur ausgehende HTTPS-Verbindung.</span></li>
          <li><span className="font-medium">3 · plantOS</span> <span className="text-muted">nimmt Samples an (<code className="font-mono text-[11px]">POST /api/edge/telemetry</code>, Bearer-Token), prüft Schreib-Form und Herkunft.</span></li>
        </ol>
        <pre className="mt-3 overflow-x-auto rounded-md border border-hairline bg-navy-deep p-3 font-mono text-[11px] text-stainless">{`curl -X POST https://<plantos>/api/edge/telemetry \\
  -H "Authorization: Bearer $PLANTOS_EDGE_TOKEN" -H "content-type: application/json" \\
  -d '{"machineId":"m-af12","agentId":"pi-line-a","origin":"SIMULATED_EDGE",
       "values":{"temperatureC":47.2,"motorCurrentA":18.9}}'`}</pre>
        <p className="mt-2 text-[11px] text-stainless-dim">SIMULATED_EDGE wird nie als S7 ausgegeben. S7_EDGE nur mit gültigen S7-Adressen oder readProof (Formprüfung, kein kryptografischer Beweis). Kein Siemens-PDU auf dem Server.</p>
      </Card>
    </div>
  );
}
