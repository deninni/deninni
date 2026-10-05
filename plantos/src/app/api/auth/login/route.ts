import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { demoUsers } from "@/lib/auth/users";
import { SESSION_COOKIE, signSession, sessionHours } from "@/lib/auth/session";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/audit";

function safeEq(a: string, b: string) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(body.password ?? "").slice(0, 200);
  const rl = rateLimit(`login:${ip}:${email}`);
  if (!rl.ok) {
    await audit({ actor: email || "?", action: "login.blocked", detail: `rate-limit ${ip}`, ok: false });
    return NextResponse.json({ error: `Zu viele Versuche. Bitte in ${rl.retryAfterS} s erneut.` }, { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } });
  }
  const user = demoUsers().find((u) => u.email === email);
  if (!user || !safeEq(user.password, password)) {
    await audit({ tenant: user?.tenant ?? "demo", actor: email || "?", action: "login.failed", detail: ip, ok: false });
    return NextResponse.json({ error: "E-Mail oder Passwort falsch" }, { status: 401 });
  }
  resetRateLimit(`login:${ip}:${email}`);
  const token = await signSession({ sub: user.email, name: user.name, role: user.role, tenant: user.tenant });
  await audit({ tenant: user.tenant, actor: user.email, action: "login.ok", detail: user.role, ok: true });
  const res = NextResponse.json({ ok: true, name: user.name, role: user.role, tenant: user.tenant });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: sessionHours() * 3600,
  });
  return res;
}
