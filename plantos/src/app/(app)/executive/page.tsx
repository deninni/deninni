import { PageHeader } from "@/components/ui/PageHeader";
import { ExecutiveView } from "./ExecutiveView";

export const metadata = { title: "Management" };

export default function ExecutivePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader gradient="radial-gradient(800px 300px at 80% 10%, rgba(90,143,163,.3), transparent 60%), linear-gradient(135deg,#141f2c 0%,#0c141d 60%,#0a0e14 100%)" eyebrow="Executive" title="Management-Übersicht" subtitle="OEE · Stillstände · Risiken · Wartung · Ersatzteile · Qualität · Energie · Wert – je Konzern, Werk oder Linie" />
      <ExecutiveView />
    </div>
  );
}
