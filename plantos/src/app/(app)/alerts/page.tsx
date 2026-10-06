import { PageHeader } from "@/components/ui/PageHeader";
import { currentAlerts } from "@/lib/server/data";
import { getSession } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/roles";
import { AlertsList } from "./AlertsList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meldungen" };

export default async function AlertsPage() {
  const s = await getSession();
  const alerts = await currentAlerts(Date.now(), s?.tenant ?? "demo");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Betrieb" title="Meldungen" subtitle="Letzte 4 Stunden · bestätigen, kommentieren, schließen, Ticket anlegen" />
      <AlertsList alerts={alerts} canWrite={!!s && hasRole(s.role, "operator")} />
    </div>
  );
}
