import { NextResponse } from "next/server";
import { assessConnector, tt214ExampleInput, type SuspicionInput } from "@/lib/diagnostics/connector-suspicion";

export async function GET() {
  return NextResponse.json({ demo: true, input: tt214ExampleInput(), result: assessConnector(tt214ExampleInput()) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as SuspicionInput | null;
  const r = assessConnector(body ?? {});
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
