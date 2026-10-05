import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getSession } from "../auth/server";

export async function edgeAuthorizedRequest(req: Request): Promise<boolean> {
  const token = process.env.PLANTOS_EDGE_TOKEN;
  const h = req.headers.get("authorization") ?? "";
  if (token && h.startsWith("Bearer ")) {
    const a = Buffer.from(h.slice(7)), b = Buffer.from(token);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return !!(await getSession());
}
