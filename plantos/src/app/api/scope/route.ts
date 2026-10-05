import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { handle, body } from "@/lib/server/http";
import { currentScope } from "@/lib/server/scope";
import { NODE_LABEL, type NodeType } from "@/lib/graph/model";

const SCOPE_TYPES: NodeType[] = ["company", "region", "country", "plant", "line"];

export const dynamic = "force-dynamic";

/** Auswahlliste für den Werk-/Ebenen-Wechsler (eingerückt nach Hierarchie). */
export async function GET() {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const b = await getBrain(auth.session.tenant);
    const current = await currentScope(b);
    const root = b.g.doc.nodes.find((n) => n.type === "company");
    const options: { id: string; name: string; type: string; typeLabel: string; depth: number }[] = [];
    const walk = (id: string, depth: number) => {
      const n = b.g.node(id)!;
      if (SCOPE_TYPES.includes(n.type)) options.push({ id: n.id, name: n.name, type: n.type, typeLabel: NODE_LABEL[n.type], depth });
      for (const c of b.g.children(id).filter((c) => ["region", "country", "site", "plant", "area", "line"].includes(c.type))) walk(c.id, SCOPE_TYPES.includes(n.type) ? depth + 1 : depth);
    };
    if (root) walk(root.id, 0);
    return NextResponse.json({ current, options, demo: b.tenant.demo, tenant: b.tenant.name });
  });
}



/** Werk-/Ebenen-Wechsel (Multi-Site): Scope muss zum Tenant gehören. */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const { scope } = await body<{ scope?: string }>(req);
    const b = await getBrain(auth.session.tenant);
    const n = scope ? b.g.node(scope) : null;
    if (!n || !["company", "region", "country", "site", "plant", "area", "line"].includes(n.type)) return NextResponse.json({ error: "Scope ungültig" }, { status: 400 });
    const res = NextResponse.json({ ok: true, scope: n.id, name: n.name });
    res.cookies.set("plantos_scope", n.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
    return res;
  });
}
