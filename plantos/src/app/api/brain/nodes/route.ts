import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { addNode } from "@/lib/graph/store";
import { isNodeType, NODE_LABEL, type NodeType } from "@/lib/graph/model";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Suche/Filter im Plant Brain: ?q=&type=machine,sensor&scope=pl-sued&limit= */
export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const types = (sp.get("type") ?? "").split(",").filter(isNodeType) as NodeType[];
    const b = await getBrain(auth.session.tenant);
    const scope = sp.get("scope");
    const nodes = b.g.search(sp.get("q") ?? "", { types, scopeId: scope && b.g.node(scope) ? scope : undefined, limit: Math.min(200, Number(sp.get("limit")) || 50) });
    return NextResponse.json({
      results: nodes.map((n) => ({ id: n.id, type: n.type, typeLabel: NODE_LABEL[n.type], name: n.name, code: n.code, path: b.g.pathOf(n.id), source: n.source })),
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireCap("graph.write");
    if ("response" in auth) return auth.response;
    const b = await body<{ type?: string; name?: string; code?: string; parentId?: string; props?: Record<string, unknown> }>(req);
    if (!isNodeType(b.type)) return NextResponse.json({ error: "Unbekannter Knotentyp" }, { status: 400 });
    const props = b.props && typeof b.props === "object" && JSON.stringify(b.props).length < 8000 ? b.props : {};
    const node = await addNode(auth.session.tenant, { type: b.type, name: String(b.name ?? ""), code: b.code ? String(b.code) : undefined, parentId: b.parentId, props, source: "user" });
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "graph.node.create", target: node.id, detail: `${node.type} ${node.name}` });
    return NextResponse.json({ node }, { status: 201 });
  });
}
