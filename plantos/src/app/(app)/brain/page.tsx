import { PageHeader } from "@/components/ui/PageHeader";
import { BrainExplorer } from "./BrainExplorer";

export const metadata = { title: "Plant Brain" };

export default function BrainPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Wissensmodell" title="Plant Brain" subtitle="Konzern → Werk → Linie → Maschine → Komponente → Sensor/Tag · SAP · Ersatzteile · Dokumente · Alarme · Tickets" />
      <BrainExplorer />
    </div>
  );
}
