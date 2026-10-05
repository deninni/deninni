import { PageHeader } from "@/components/ui/PageHeader";
import { EnterpriseView } from "./EnterpriseView";
import { getSession } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

export const metadata = { title: "Konzern & Werke" };

export default async function EnterprisePage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  const s = (await getSession())!;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader eyebrow="Multi-Site" title="Konzern & Werke" subtitle="Konzern → Region → Land → Werk → Bereich → Linie → Maschine · Kennzahlen je Ebene" />
      <EnterpriseView initialScope={scope} isAdmin={can(s.role, "tenant.config")} />
    </div>
  );
}
