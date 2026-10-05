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
