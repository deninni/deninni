import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { handoverPlainText } from "@/lib/handover/build";
import { isMachineId } from "@/lib/plants";
import { collectHandover } from "@/lib/server/handover";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireRole("viewer");
  if ("response" in auth) return auth.response;
  const mid = new URL(req.url).searchParams.get("machineId") ?? undefined;
  if (mid && !isMachineId(mid)) return NextResponse.json({ error: "Anlage unbekannt" }, { status: 404 });
  const h = await collectHandover(auth.session.name, mid, auth.session.tenant);
  return NextResponse.json({ handover: h, text: handoverPlainText(h) });
}
