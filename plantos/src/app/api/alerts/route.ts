import { NextResponse } from "next/server";
import { currentAlerts } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ alerts: await currentAlerts() });
}
