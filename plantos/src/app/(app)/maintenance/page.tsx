import { PageHeader } from "@/components/ui/PageHeader";
import { getSession } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { PlannerView } from "./PlannerView";

export const metadata = { title: "Wartungsplaner" };

export default async function MaintenancePage() {
  const s = (await getSession())!;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader eyebrow="Betrieb" title="Wartungsplaner" subtitle="Prognose + Ersatzteile + Lieferzeit + Wartungsfenster + Techniker → Vorschlag · keine automatische Buchung" />
      <PlannerView user={s.sub} canApprove={can(s.role, "maintenance.approve")} canExecute={can(s.role, "sap.execute")} />
    </div>
  );
}
