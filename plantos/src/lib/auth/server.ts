import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, type Session } from "./session";
import { hasRole, type Role } from "./users";

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/** Für Route-Handler: liefert Session oder eine fertige 401/403-Antwort. */
export async function requireRole(role: Role = "viewer"): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }) };
  if (!hasRole(session.role, role)) {
    return { response: NextResponse.json({ error: `Rolle „${role}“ erforderlich` }, { status: 403 }) };
  }
  return { session };
}
