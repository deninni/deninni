import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { readAudit, verifyAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCap("audit.read");
  if ("response" in auth) return auth.response;
  return NextResponse.json({ entries: await readAudit(500, auth.session.tenant), integrity: await verifyAudit(auth.session.tenant) });
}
