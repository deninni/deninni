import { NextResponse } from "next/server";
import { currentAlerts } from "@/lib/server/data";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole("viewer");
  if ("response" in auth) return auth.response;
  return NextResponse.json({ alerts: await currentAlerts(Date.now(), auth.session.tenant) });
}
