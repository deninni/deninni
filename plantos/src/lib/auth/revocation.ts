import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir, writeJsonAtomic } from "../store/store";

/** Serverseitiger Widerruf von Sitzungen (Logout macht das Cookie sofort ungültig). */
let revoked: Record<string, number> | null = null;

function file() {
  return path.join(dataDir(), "revoked-sessions.json");
}

async function load() {
  if (revoked) return revoked;
  try { revoked = JSON.parse(await fs.readFile(file(), "utf8")); } catch { revoked = {}; }
  return revoked!;
}

export async function revokeSession(sid: string, exp: number) {
  const r = await load();
  r[sid] = exp;
  const now = Date.now();
  for (const [k, v] of Object.entries(r)) if (v < now) delete r[k];
  await writeJsonAtomic(file(), r);
}

export async function isRevoked(sid: string): Promise<boolean> {
  const r = await load();
  return sid in r;
}
