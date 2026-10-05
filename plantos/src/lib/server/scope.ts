import "server-only";
import { cookies } from "next/headers";
import type { Brain } from "./brain";
import { resolveScope } from "./brain";

export const SCOPE_COOKIE = "plantos_scope";

/** Aktueller Multi-Site-Scope aus dem Cookie, validiert gegen den Tenant-Graphen. */
export async function currentScope(b: Brain): Promise<string> {
  const jar = await cookies();
  return resolveScope(b, jar.get(SCOPE_COOKIE)?.value);
}

/** Scope aus ?scope= (falls angegeben) sonst aus dem Cookie. */
export async function scopeFrom(b: Brain, req: Request): Promise<string> {
  const q = new URL(req.url).searchParams.get("scope");
  return q ? resolveScope(b, q) : currentScope(b);
}
