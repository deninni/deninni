import { isRole, type Role } from "./roles";

/**
 * Signierte Sessions (HMAC-SHA256 über Web Crypto – läuft in Middleware und Route-Handlern).
 * Format: base64url(payload).base64url(signature)
 */

export const SESSION_COOKIE = "plantos_session";
const DEV_SECRET = "plantos-dev-secret-change-me-before-any-pilot-0001";

export interface Session {
  sub: string;
  name: string;
  role: Role;
  /** Mandant – alle Daten-APIs filtern hierauf */
  tenant: string;
  /** Sitzungs-ID (für serverseitigen Widerruf beim Logout) */
  sid: string;
  /** Anmeldeverfahren */
  amr: "password" | "oidc";
  iat: number;
  exp: number;
}

export function sessionSecretConfigured(): boolean {
  const s = process.env.PLANTOS_SESSION_SECRET;
  return !!s && s.length >= 32;
}

function secret(): string {
  return sessionSecretConfigured() ? process.env.PLANTOS_SESSION_SECRET! : DEV_SECRET;
}

export function sessionHours(): number {
  const h = Number(process.env.PLANTOS_SESSION_HOURS);
  return Number.isFinite(h) && h > 0 && h <= 72 ? h : 12;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

export async function signSession(data: Omit<Session, "iat" | "exp" | "sid" | "amr"> & { amr?: Session["amr"] }, now = Date.now()): Promise<string> {
  const sidBytes = new Uint8Array(12);
  crypto.getRandomValues(sidBytes);
  const payload: Session = { amr: "password", ...data, sid: b64url(sidBytes), iat: now, exp: now + sessionHours() * 3600_000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(body));
  return `${body}.${sig}`;
}

export async function verifySession(token: string | undefined | null, now = Date.now()): Promise<Session | null> {
  if (!token || token.length > 4096) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const expected = await hmac(body);
    if (!timingSafeEqual(expected, fromB64url(sig))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (!isRole(payload.role)) return null;
    if (typeof payload.tenant !== "string" || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(payload.tenant)) return null;
    if (typeof payload.sid !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}
