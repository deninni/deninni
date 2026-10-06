import { PageHeader } from "@/components/ui/PageHeader";
import { ValueView } from "./ValueView";
import { getSession } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

export const metadata = { title: "Wert & ROI" };

export default async function ValuePage() {
  const s = (await getSession())!;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader eyebrow="Analyse" title="plantOS Value Generated" subtitle="Nur verifizierte Ergebnisse zählen als realisiert · Annahmen konfigurierbar · DEMO getrennt" />
      <ValueView canConfig={can(s.role, "roi.config")} />
    </div>
  );
}
