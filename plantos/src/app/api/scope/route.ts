import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { handle, body } from "@/lib/server/http";



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
