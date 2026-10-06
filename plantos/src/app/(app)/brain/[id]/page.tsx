import { AssetDetail } from "./AssetDetail";
import { getSession } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";

export const metadata = { title: "Asset" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = (await getSession())!;
  return <AssetDetail id={decodeURIComponent(id)} perms={{ comment: can(s.role, "memory.comment"), write: can(s.role, "memory.write"), confirm: can(s.role, "maintenance.confirm") }} />;
}
