import { PageHeader } from "@/components/ui/PageHeader";
import { DiscoveryView } from "./DiscoveryView";
import { getSession } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

export const metadata = { title: "Discovery" };

export default async function DiscoveryPage() {
  const s = (await getSession())!;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader eyebrow="System" title="Discovery (sicher)" subtitle="IO-Listen, EPLAN, TIA/Step7, OPC-UA-Export · keine Netzwerkscans · keine Schreibzugriffe · Zuordnung nur als Vorschlag" />
      <DiscoveryView canImport={can(s.role, "graph.write")} canConfirm={can(s.role, "discovery.confirm")} />
    </div>
  );
}
