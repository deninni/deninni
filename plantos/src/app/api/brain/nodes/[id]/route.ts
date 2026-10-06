import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { NODE_LABEL, EDGE_LABEL } from "@/lib/graph/model";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const b = await getBrain(auth.session.tenant);
    const n = b.g.node(decodeURIComponent(id));
    if (!n) return NextResponse.json({ error: "Asset unbekannt" }, { status: 404 });
    const subtree = new Set([n.id, ...b.g.descendants(n.id).map((x) => x.id)]);
    return NextResponse.json({
      node: { ...n, typeLabel: NODE_LABEL[n.type] },
      path: b.g.pathOf(n.id, "company"),
      ancestors: b.g.ancestors(n.id).map((a) => ({ id: a.id, type: a.type, typeLabel: NODE_LABEL[a.type], name: a.name, code: a.code })),
      children: b.g.children(n.id).map((c) => ({ id: c.id, type: c.type, typeLabel: NODE_LABEL[c.type], name: c.name, code: c.code, childCount: b.g.children(c.id).length })),
      relations: b.g.related(n.id).filter((r) => r.edge.type !== "partOf").map((r) => ({ edgeId: r.edge.id, type: r.edge.type, label: EDGE_LABEL[r.edge.type], dir: r.dir, source: r.edge.source, node: { id: r.node.id, type: r.node.type, typeLabel: NODE_LABEL[r.node.type], name: r.node.name, code: r.node.code } })),
      machineId: b.g.ancestorOfType(n.id, "machine")?.id ?? null,
      plantId: b.g.ancestorOfType(n.id, "plant")?.id ?? null,
      memoryCount: b.memory.filter((m) => subtree.has(m.assetId)).length,
      spareParts: b.g.sparePartsOf(n.id).map((s) => ({ id: s.id, name: s.name, code: s.code, props: s.props })),
    });
  });
}
