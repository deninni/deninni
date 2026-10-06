import { PageHeader } from "@/components/ui/PageHeader";
import { readStore } from "@/lib/store/store";
import { getSession } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/roles";
import { TicketBoard } from "./TicketBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tickets" };

export default async function TicketsPage() {
  const s = await getSession();
  const tickets = [...(await readStore(s?.tenant ?? "demo")).tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Betrieb" title="Tickets" subtitle="Instandhaltungs-Tickets · automatische Meldungen werden zusammengeführt" />
      <TicketBoard tickets={tickets} canWrite={!!s && hasRole(s.role, "operator")} />
    </div>
  );
}
