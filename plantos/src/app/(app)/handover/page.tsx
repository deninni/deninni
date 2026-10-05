import { PageHeader } from "@/components/ui/PageHeader";
import { getSession } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/roles";
import { collectHandover } from "@/lib/server/handover";
import { handoverPlainText } from "@/lib/handover/build";
import { HandoverView } from "./HandoverView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schichtübergabe" };

export default async function HandoverPage() {
  const s = (await getSession())!;
  const h = await collectHandover(s.name, undefined, s.tenant);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={h.shift} title="Schichtübergabe" subtitle="Was die nächste Schicht prüfen muss, bevor Hardware angefasst wird · Trust: Supervised" />
      <HandoverView handover={h} text={handoverPlainText(h)} canWrite={hasRole(s.role, "operator")} />
    </div>
  );
}
