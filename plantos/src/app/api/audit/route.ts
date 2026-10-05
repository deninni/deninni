import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { readAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole("admin");
  if ("response" in auth) return auth.response;
  return NextResponse.json({ entries: await readAudit(500) });
}
