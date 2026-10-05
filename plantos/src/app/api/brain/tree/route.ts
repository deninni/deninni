import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain, companyId } from "@/lib/server/brain";
import { NODE_LABEL, HIERARCHY } from "@/lib/graph/model";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Anlagenbaum (lazy): Kinder eines Knotens mit Anzahl Unterknoten. ?root= */
export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const b = await getBrain(auth.session.tenant);
    const rootParam = new URL(req.url).searchParams.get("root");
    const root = rootParam && b.g.node(rootParam) ? rootParam : companyId(b);
    const rootNode = b.g.node(root)!;
    const kids = b.g.children(root).sort((a, c) => HIERARCHY.indexOf(a.type) - HIERARCHY.indexOf(c.type) || a.name.localeCompare(c.name));
    return NextResponse.json({
      root: { id: rootNode.id, type: rootNode.type, typeLabel: NODE_LABEL[rootNode.type], name: rootNode.name, code: rootNode.code },
      children: kids.map((c) => ({ id: c.id, type: c.type, typeLabel: NODE_LABEL[c.type], name: c.name, code: c.code, childCount: b.g.children(c.id).length })),
    });
  });
}
