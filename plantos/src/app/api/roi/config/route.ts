import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { loadRoiConfig, saveRoiConfig } from "@/lib/roi/config-store";
import { validateConfigPatch, CONFIG_FIELDS } from "@/lib/roi/engine";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    return NextResponse.json({ config: await loadRoiConfig(auth.session.tenant), fields: CONFIG_FIELDS });
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const auth = await requireCap("roi.config");
    if ("response" in auth) return auth.response;
    const v = validateConfigPatch(await body(req));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const before = await loadRoiConfig(auth.session.tenant);
    const changes = Object.entries(v.value).map(([k, val]) => `${k}: ${(before as unknown as Record<string, unknown>)[k]} → ${val}`).join("; ");
    const cfg = await saveRoiConfig(auth.session.tenant, v.value, auth.session.sub);
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "config.change", target: "roi-config", detail: changes });
    return NextResponse.json({ config: cfg });
  });
}
