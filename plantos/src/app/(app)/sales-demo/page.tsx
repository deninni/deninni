import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { RoiCalculator } from "./RoiCalculator";

export const metadata = { title: "Sales Demo" };

const STEPS = [
  { href: "/dashboard", title: "Control Room", text: "Drei Linien, Aufmerksamkeit zuerst. Eine Störung, eine Warnung – keine KPI-Wand." },
  { href: "/digital-twin?machine=m-af12", title: "Digital Twin AF-12", text: "Füller, Sternräder, Verschließer in 3D. Klick auf Komponente → Zustand, SPS-Tag, Ursache." },
  { href: "/historie", title: "Historie & Ursachenanalyse", text: "Anomalie-Fenster der letzten Stunden, Regelbaum mit Evidenz und Prüfschritten. Ein Klick: Ticket aus RCA – Duplikate werden zusammengeführt." },
  { href: "/ai", title: "Anlagen-Copilot", text: "„Warum ist die Linie auffällig?“ – Antwort aus Messwerten. „Schalte FT-7 ab“ – klares Nein (Trust: Supervised)." },
  { href: "/connect", title: "Connect & Schreibschutz", text: "Edge-Agent im OT-Netz, nur ausgehend, nur Lesen. Symbolliste per CSV statt Projektzugriff." },
  { href: "/handover", title: "Schichtübergabe", text: "Was die nächste Schicht prüfen muss – als Klartext oder PDF mit Unterschriftzeile." },
];

export default function SalesDemoPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader eyebrow="Für Werksleitung, Instandhaltung, OT-Security" title="plantOS in 10 Minuten" subtitle="Monitoring, Diagnose und Übergabe für Abfüll- und Verpackungslinien – ohne Eingriff in die SPS" />
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} className="card focus-ring block h-full p-4 transition-colors hover:border-accent-border">
              <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full border border-accent-border bg-accent-muted text-[11px] font-semibold text-accent">{i + 1}</span><span className="font-medium">{s.title}</span></div>
              <p className="mt-2 text-[13px] text-muted">{s.text}</p>
            </Link>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Warum OT-Security zustimmt">
          <ul className="space-y-1.5 text-[13px] text-muted">
            <li>• SPS nur Lesen – Schreib-Endpunkte antworten immer 403</li>
            <li>• Edge-Agent: nur ausgehende HTTPS-Verbindung, Bearer-Token</li>
            <li>• Signierte Sessions, Rollen (lesend / Schicht / Admin), Audit-Log</li>
            <li>• Local-first: keine Cloud-Pflicht, kein Cloud-LLM, Daten bleiben im Werk</li>
            <li>• Strikte Security-Header (CSP, Frame-Deny)</li>
          </ul>
        </Card>
        <Card title="Was ehrlich noch fehlt">
          <ul className="space-y-1.5 text-[13px] text-muted">
            <li>• Keine Kunden-SPS angebunden – Werte sind Demo-Engine</li>
            <li>• SSO (Entra ID) vorbereitet, nicht konfiguriert</li>
            <li>• 3D ist Stilisierung, kein Aufmaß der Kundenanlage</li>
            <li>• RCA ist Regelbaum (Heuristik), kein ML, nicht zertifiziert</li>
          </ul>
        </Card>
      </div>
      <RoiCalculator />
    </div>
  );
}
