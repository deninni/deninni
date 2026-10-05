import { notFound } from "next/navigation";
import { getMachine } from "@/lib/plants";
import { PageHeader } from "@/components/ui/PageHeader";
import { MachineDetail } from "./MachineDetail";
import { getSession } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: getMachine(id)?.name ?? "Anlage" };
}

export default async function MachinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const m = getMachine(id);
  if (!m || m.id !== id) notFound();
  const s = await getSession();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader gradient={m.gradient} eyebrow={`${m.line} · ${m.kind}`} title={m.name} subtitle={m.description} />
      <MachineDetail machine={m} initialTab={tab} canWrite={!!s && hasRole(s.role, "operator")} />
    </div>
  );
}
