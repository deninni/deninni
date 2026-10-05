import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain, metricsFor } from "@/lib/server/brain";
import { rollup } from "@/lib/enterprise/rollup";
import { NODE_LABEL } from "@/lib/graph/model";
import { scopeFrom } from "@/lib/server/scope";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const b = await getBrain(auth.session.tenant);
    const scope = await scopeFrom(b, req);
    const r = rollup(b.g, scope, metricsFor(b), Math.min(3, Number(sp.get("depth")) || 1));
    return NextResponse.json({
      scope: r, path: b.g.ancestors(scope).reverse().map((a) => ({ id: a.id, name: a.name, type: a.type, typeLabel: NODE_LABEL[a.type] })),
      tenant: { id: b.tenant.id, name: b.tenant.name, demo: b.tenant.demo }, source: "DEMO",
    });
  });
}
