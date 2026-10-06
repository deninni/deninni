import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { addEdge } from "@/lib/graph/store";
import { isEdgeType } from "@/lib/graph/model";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireCap("graph.write");
    if ("response" in auth) return auth.response;
    const b = await body<{ from?: string; to?: string; type?: string }>(req);
    if (!isEdgeType(b.type) || !b.from || !b.to) return NextResponse.json({ error: "from/to/type erforderlich" }, { status: 400 });
    const edge = await addEdge(auth.session.tenant, { from: b.from, to: b.to, type: b.type, source: "user" });
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "graph.edge.create", target: edge.id });
    return NextResponse.json({ edge }, { status: 201 });
  });
}
