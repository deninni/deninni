import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { revokeSession } from "@/lib/auth/revocation";

export async function POST(req: NextRequest) {
  const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (s) {
    await revokeSession(s.sid, s.exp);
    await audit({ tenant: s.tenant, actor: s.sub, action: "logout", ok: true });
  }
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
