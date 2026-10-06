import { NextResponse } from "next/server";
import { oidcConfig, discover, authorizationUrl, pkcePair, randomToken } from "@/lib/auth/oidc";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cfg = oidcConfig();
  if (!cfg) return NextResponse.json({ error: "SSO (OIDC/Entra ID) ist nicht konfiguriert.", hint: "PLANTOS_OIDC_ISSUER, PLANTOS_OIDC_CLIENT_ID, PLANTOS_OIDC_REDIRECT_URI setzen" }, { status: 501 });
  try {
    const d = await discover(cfg);
    const { verifier, challenge } = await pkcePair();
    const state = randomToken(24), nonce = randomToken(24);
    const res = NextResponse.redirect(authorizationUrl(d, cfg, { state, nonce, challenge }));
    res.cookies.set("plantos_oidc", JSON.stringify({ state, nonce, verifier }), { httpOnly: true, sameSite: "lax", secure: new URL(req.url).protocol === "https:", path: "/api/auth/oidc", maxAge: 600 });
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
