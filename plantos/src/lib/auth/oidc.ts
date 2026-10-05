import { getSecret } from "../config/secrets";
import { isRole, type Role } from "./roles";

/**
 * OIDC / Microsoft Entra ID (Authorization Code + PKCE S256).
 * Implementiert: Konfiguration, PKCE, State/Nonce, Token-Tausch, ID-Token-Prüfung (RS256 über JWKS,
 * iss/aud/exp/nonce), Gruppen→Rollen-Mapping. Nicht gegen einen echten Entra-Tenant validiert.
 * SAML: nur Architektur dokumentiert (docs/SECURITY.md), nicht implementiert.
 */
export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string;
  tenantId: string;
  roleMap: Record<string, Role>;
  defaultRole: Role | null;
}

export function oidcConfig(): OidcConfig | null {
  const issuer = process.env.PLANTOS_OIDC_ISSUER;
  const clientId = process.env.PLANTOS_OIDC_CLIENT_ID;
  const redirectUri = process.env.PLANTOS_OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !redirectUri) return null;
  let roleMap: Record<string, Role> = {};
  try {
    const raw = JSON.parse(process.env.PLANTOS_OIDC_ROLE_MAP ?? "{}") as Record<string, string>;
    roleMap = Object.fromEntries(Object.entries(raw).filter(([, r]) => isRole(r))) as Record<string, Role>;
  } catch { roleMap = {}; }
  const dr = process.env.PLANTOS_OIDC_DEFAULT_ROLE;
  return {
    issuer: issuer.replace(/\/$/, ""), clientId, clientSecret: getSecret("PLANTOS_OIDC_CLIENT_SECRET"), redirectUri,
    scopes: process.env.PLANTOS_OIDC_SCOPES ?? "openid profile email",
    tenantId: process.env.PLANTOS_OIDC_PLANTOS_TENANT ?? "demo", roleMap, defaultRole: isRole(dr) ? dr : null,
  };
}

/** Entra-ID-Issuer für einen Azure-Tenant (Vorlage). */
export function entraIssuer(azureTenantId: string) {
  return `https://login.microsoftonline.com/${azureTenantId}/v2.0`;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a);
}

export async function pkcePair() {
  const verifier = randomToken(48);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

interface Discovery { authorization_endpoint: string; token_endpoint: string; jwks_uri: string; issuer: string }
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function discover(cfg: OidcConfig, f: FetchLike = fetch): Promise<Discovery> {
  const r = await f(`${cfg.issuer}/.well-known/openid-configuration`);
  if (!r.ok) throw new Error(`OIDC-Discovery fehlgeschlagen (${r.status})`);
  return (await r.json()) as Discovery;
}

export function authorizationUrl(d: Discovery, cfg: OidcConfig, p: { state: string; nonce: string; challenge: string }) {
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", cfg.scopes);
  u.searchParams.set("state", p.state);
  u.searchParams.set("nonce", p.nonce);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export async function exchangeCode(d: Discovery, cfg: OidcConfig, code: string, verifier: string, f: FetchLike = fetch): Promise<{ id_token: string }> {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, code_verifier: verifier });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  const r = await f(d.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`Token-Tausch fehlgeschlagen (${r.status})`);
  const j = (await r.json()) as { id_token?: string };
  if (!j.id_token) throw new Error("Kein id_token erhalten");
  return { id_token: j.id_token };
}

export interface IdClaims { iss: string; aud: string | string[]; exp: number; iat?: number; nonce?: string; sub: string; email?: string; preferred_username?: string; name?: string; groups?: string[]; roles?: string[] }

/** ID-Token prüfen: Signatur (RS256, JWKS), Aussteller, Zielgruppe, Ablauf, Nonce. */
export async function verifyIdToken(token: string, cfg: OidcConfig, d: Discovery, nonce: string, f: FetchLike = fetch, now = Date.now()): Promise<IdClaims> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("ID-Token ungültig");
  const header = JSON.parse(new TextDecoder().decode(fromB64url(h))) as { alg: string; kid?: string };
  if (header.alg !== "RS256") throw new Error("Nur RS256 erlaubt");
  const jwks = (await (await f(d.jwks_uri)).json()) as { keys: (JsonWebKey & { kid?: string })[] };
  const jwk = jwks.keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) throw new Error("Signaturschlüssel nicht gefunden");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(s) as BufferSource, new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("Signatur ungültig");
  const c = JSON.parse(new TextDecoder().decode(fromB64url(p))) as IdClaims;
  if (c.iss.replace(/\/$/, "") !== d.issuer.replace(/\/$/, "")) throw new Error("Aussteller ungültig");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(cfg.clientId)) throw new Error("Zielgruppe ungültig");
  if (c.exp * 1000 < now - 60_000) throw new Error("ID-Token abgelaufen");
  if (c.nonce !== nonce) throw new Error("Nonce ungültig");
  return c;
}

/** Gruppen/App-Rollen → plantOS-Rolle (höchste gewinnt). Ohne Treffer: defaultRole oder Ablehnung. */
export function mapRole(c: IdClaims, cfg: OidcConfig): Role | null {
  const order: Role[] = ["admin", "plant_manager", "maintenance", "operator", "viewer"];
  const mapped = [...(c.groups ?? []), ...(c.roles ?? [])].map((g) => cfg.roleMap[g]).filter(Boolean) as Role[];
  return order.find((r) => mapped.includes(r)) ?? cfg.defaultRole;
}
