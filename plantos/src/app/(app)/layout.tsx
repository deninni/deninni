import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { Shell } from "@/components/layout/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  return <Shell user={{ name: s.name, role: s.role, sub: s.sub }}>{children}</Shell>;
}
