import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { tenantConfig, setCrossPlantLearning } from "@/lib/tenant/config-store";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    return NextResponse.json({ tenant: await tenantConfig(auth.session.tenant) });
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const auth = await requireCap("tenant.config");
    if ("response" in auth) return auth.response;
    const b = await body<{ crossPlantLearning?: boolean }>(req);
    if (typeof b.crossPlantLearning !== "boolean") return NextResponse.json({ error: "crossPlantLearning (boolean) erforderlich" }, { status: 400 });
    await setCrossPlantLearning(auth.session.tenant, b.crossPlantLearning, auth.session.sub);
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "config.change", target: "tenant", detail: `crossPlantLearning=${b.crossPlantLearning}` });
    return NextResponse.json({ tenant: await tenantConfig(auth.session.tenant) });
  });
}
