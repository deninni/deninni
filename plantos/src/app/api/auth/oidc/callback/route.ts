import { NextResponse, type NextRequest } from "next/server";
import { oidcConfig, discover, exchangeCode, verifyIdToken, mapRole } from "@/lib/auth/oidc";
import { SESSION_COOKIE, signSession, sessionHours } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cfg = oidcConfig();
  if (!cfg) return NextResponse.json({ error: "SSO nicht konfiguriert" }, { status: 501 });
  const url = new URL(req.url);
  let st: { state: string; nonce: string; verifier: string };
  try { st = JSON.parse(req.cookies.get("plantos_oidc")?.value ?? ""); } catch { return NextResponse.json({ error: "SSO-Sitzung fehlt" }, { status: 400 }); }
  if (!st.state || url.searchParams.get("state") !== st.state) return NextResponse.json({ error: "State ungültig" }, { status: 400 });
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: url.searchParams.get("error_description") ?? "Kein Code" }, { status: 400 });
  try {
    const d = await discover(cfg);
    const { id_token } = await exchangeCode(d, cfg, code, st.verifier);
    const claims = await verifyIdToken(id_token, cfg, d, st.nonce);
    const role = mapRole(claims, cfg);
    const sub = (claims.email ?? claims.preferred_username ?? claims.sub).toLowerCase();
    if (!role) {
      await audit({ tenant: cfg.tenantId, actor: sub, action: "login.sso.denied", detail: "keine Rollenzuordnung", ok: false });
      return NextResponse.json({ error: "Kein Zugriff: keine plantOS-Rolle zugeordnet" }, { status: 403 });
    }
    const token = await signSession({ sub, name: claims.name ?? sub, role, tenant: cfg.tenantId, amr: "oidc" });
    await audit({ tenant: cfg.tenantId, actor: sub, action: "login.sso.ok", detail: role, ok: true });
    const res = NextResponse.redirect(new URL("/dashboard", req.url));
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: sessionHours() * 3600 });
    res.cookies.set("plantos_oidc", "", { path: "/api/auth/oidc", maxAge: 0 });
    return res;
  } catch (e) {
    await audit({ tenant: cfg.tenantId, actor: "?", action: "login.sso.failed", detail: (e as Error).message, ok: false });
    return NextResponse.json({ error: "SSO-Anmeldung fehlgeschlagen" }, { status: 401 });
  }
}
