import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getSession } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/roles";
import { readAudit } from "@/lib/audit";
import { dateTimeDe } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit-Log" };

export default async function AuditPage() {
  const s = await getSession();
  if (!s || !hasRole(s.role, "admin")) redirect("/dashboard");
  const entries = await readAudit(300, s.tenant);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="System" title="Audit-Log" subtitle="Wer hat wann was gemeldet, bestätigt, angelegt oder exportiert · append-only" />
      <Card padded={false}>
        {entries.length === 0 ? <p className="p-4 text-[13px] text-muted">Noch keine Einträge.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-[11px] text-muted"><th className="px-4 py-2 font-medium">Zeit</th><th className="px-4 py-2 font-medium">Benutzer</th><th className="px-4 py-2 font-medium">Aktion</th><th className="px-4 py-2 font-medium">Ziel / Detail</th></tr></thead>
              <tbody className="divide-y divide-hairline">
                {entries.map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-4 py-1.5 tabular-nums text-muted">{dateTimeDe(e.at)}</td>
                    <td className="px-4 py-1.5">{e.actor}</td>
                    <td className="px-4 py-1.5"><Badge tone={e.ok === false ? "fault" : e.action.includes("refused") ? "warn" : "muted"}>{e.action}</Badge></td>
                    <td className="max-w-md truncate px-4 py-1.5 text-muted">{[e.target, e.detail].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
