import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { handoverPdf, handoverFilename } from "@/lib/handover/build";
import { isMachineId } from "@/lib/plants";
import { audit } from "@/lib/audit";
import { collectHandover } from "@/lib/server/handover";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireRole("viewer");
  if ("response" in auth) return auth.response;
  const mid = new URL(req.url).searchParams.get("machineId") ?? undefined;
  if (mid && !isMachineId(mid)) return NextResponse.json({ error: "Anlage unbekannt" }, { status: 404 });
  const h = await collectHandover(auth.session.name, mid);
  const pdf = handoverPdf(h);
  await audit({ actor: auth.session.sub, action: "handover.pdf", target: mid ?? "alle" });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${handoverFilename(new Date(h.generatedAt))}"`,
      "cache-control": "no-store",
    },
  });
}
