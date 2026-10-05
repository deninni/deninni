import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, type Session } from "./session";
import { can, hasRole, type Capability, type Role } from "./roles";
import { isRevoked } from "./revocation";
import { rateLimit } from "./rate-limit";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const s = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  if (await isRevoked(s.sid)) return null;
  return s;
}

type Guard = { session: Session } | { response: NextResponse };

/** Für Route-Handler: liefert Session oder eine fertige 401/403-Antwort. */
export async function requireRole(role: Role = "viewer"): Promise<Guard> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) };
  if (!hasRole(session.role, role)) {
    return { response: NextResponse.json({ error: `Rolle „${role}“ erforderlich` }, { status: 403 }) };
  }
  return { session };
}

/**
 * Fähigkeitsbasierte Prüfung + Schreib-Rate-Limit (60 schreibende Aufrufe/min je Benutzer).
 * Für lesende Capabilities entfällt das Rate-Limit.
 */
export async function requireCap(cap: Capability): Promise<Guard> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) };
  if (!can(session.role, cap)) {
    return { response: NextResponse.json({ error: `Keine Berechtigung (${cap})` }, { status: 403 }) };
  }
  if (cap !== "read" && cap !== "audit.read") {
    const rl = rateLimit(`write:${session.tenant}:${session.sub}`, 60, 60_000);
    if (!rl.ok) return { response: NextResponse.json({ error: "Zu viele Schreibzugriffe" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } }) };
  }
  return { session };
}
