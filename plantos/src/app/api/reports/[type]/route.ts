import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain, predictionsFor, metricsFor, resolveScope } from "@/lib/server/brain";
import { buildReport, reportPdf, REPORT_TYPES, type ReportType } from "@/lib/reports/build";
import { loadRoiConfig } from "@/lib/roi/config-store";
import { readStore } from "@/lib/store/store";
import { handle } from "@/lib/server/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const { type } = await params;
    if (!(type in REPORT_TYPES)) return NextResponse.json({ error: "Unbekannter Berichtstyp" }, { status: 404 });
    const sp = new URL(req.url).searchParams;
    const b = await getBrain(auth.session.tenant);
    const scopeId = resolveScope(b, sp.get("scope"));
    const report = buildReport(type as ReportType, b, { scopeId, preds: predictionsFor(b), metrics: metricsFor(b), cfg: await loadRoiConfig(auth.session.tenant), tickets: (await readStore(auth.session.tenant)).tickets, user: auth.session.name });
    if (sp.get("format") === "pdf") {
      await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "report.export", target: type, detail: scopeId });
      const day = new Date().toISOString().slice(0, 10);
      return new NextResponse(Buffer.from(reportPdf(report)), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="plantos-${type}-${day}.pdf"`, "cache-control": "no-store" } });
    }
    return NextResponse.json({ report });
  });
}
