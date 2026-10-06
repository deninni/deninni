import { PageHeader } from "@/components/ui/PageHeader";
import { CopilotChat } from "./CopilotChat";
import { assessConnector, tt214ExampleInput } from "@/lib/diagnostics/connector-suspicion";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MehrZahlen } from "@/components/ui/MehrZahlen";

export const metadata = { title: "KI-Copilot" };

export default function AiPage() {
  const tt = assessConnector(tt214ExampleInput());
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Analyse" title="Anlagen-Copilot" subtitle="Fragen zu Zustand, Ursachen, OEE, Tickets · lokal, ohne Cloud" />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <CopilotChat />
        <div className="space-y-4">
          <Card title="Umfang">
            <ul className="space-y-1.5 text-[12px] text-muted">
              <li>✓ Zustand, Meldungen, Ursachen (RCA), OEE, Tickets</li>
              <li>✓ „Ticket aus RCA“ legt ein Ticket an (Supervised)</li>
              <li>✗ Keine Steuerung: kein Stopp, kein Sollwert, keine Bestellung</li>
              <li>✗ Keine Themen ohne Anlagenbezug</li>
            </ul>
            <p className="mt-3 text-[11px] text-stainless-dim">Lokales, regelbasiertes Modell. Keine Daten verlassen das Werk.</p>
          </Card>
          {tt.ok && (
            <Card title="Stecker-Verdacht · TT-214" action={<Badge tone="warn">DEMO</Badge>}>
              <div className="flex items-center gap-2"><Badge tone={tt.stufe === "dringend" ? "fault" : tt.stufe === "verdacht" ? "warn" : "muted"}>{tt.stufe}</Badge><span className="text-[12px] text-muted">Score {tt.score}</span></div>
              <p className="mt-2 text-[12px]">{tt.nachricht}</p>
              <MehrZahlen>
                <ul className="text-[12px] text-muted">{tt.gruende.map((g) => <li key={g.text}>{g.text} · {g.punkte} P</li>)}</ul>
                <p className="mt-2 text-[11px] text-stainless-dim">{tt.hinweis}</p>
                {tt.ignoriert.length > 0 && <p className="mt-1 text-[11px] text-stainless-dim">Ignoriert: {tt.ignoriert.join(", ")}</p>}
              </MehrZahlen>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
