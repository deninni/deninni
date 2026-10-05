import { NextResponse } from "next/server";
import { edgePlants } from "@/lib/plc/edge-state";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ plants: await edgePlants() });
}
