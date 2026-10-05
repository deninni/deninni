import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { listSapActions } from "@/lib/sap/actions";
import { getBrain } from "@/lib/server/brain";
import { sapAdapterFor, SAP_VALIDATION_NOTE } from "@/lib/sap/adapter";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const b = await getBrain(auth.session.tenant);
    const adapter = sapAdapterFor(b.g);
    return NextResponse.json({ actions: await listSapActions(auth.session.tenant), adapter: { mode: adapter.mode, validated: adapter.validated, note: SAP_VALIDATION_NOTE } });
  });
}
