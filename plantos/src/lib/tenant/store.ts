import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir, writeJsonAtomic } from "../store/store";
import { assertTenantId } from "./tenants";

/**
 * Generischer, mandantengetrennter Dokument-Store: data/tenants/<tenant>/<name>.json
 * - Pfade werden aus validierter Tenant-ID + fester Namensliste gebildet (kein Path-Traversal)
 * - Mutationen pro Datei serialisiert, atomar geschrieben
 */
const NAME_RE = /^[a-z0-9-]{2,40}$/;

export function tenantDir(tenant: string): string {
  return path.join(dataDir(), "tenants", assertTenantId(tenant));
}

function fileFor(tenant: string, name: string) {
  if (!NAME_RE.test(name)) throw new Error(`Ungültiger Store-Name: ${name}`);
  return path.join(tenantDir(tenant), `${name}.json`);
}

const cache = new Map<string, unknown>();
const chains = new Map<string, Promise<unknown>>();

export async function readDoc<T>(tenant: string, name: string, init: () => T | Promise<T>): Promise<T> {
  const f = fileFor(tenant, name);
  if (cache.has(f)) return cache.get(f) as T;
  let value: T;
  try {
    value = JSON.parse(await fs.readFile(f, "utf8")) as T;
  } catch {
    value = await init();
    await writeJsonAtomic(f, value);
  }
  cache.set(f, value);
  return value;
}

export function mutateDoc<T, R>(tenant: string, name: string, init: () => T | Promise<T>, fn: (doc: T) => R | Promise<R>): Promise<R> {
  const f = fileFor(tenant, name);
  const prev = chains.get(f) ?? Promise.resolve();
  const run = prev.then(async () => {
    const doc = await readDoc<T>(tenant, name, init);
    const r = await fn(doc);
    await writeJsonAtomic(f, doc);
    return r;
  });
  chains.set(f, run.catch(() => undefined));
  return run;
}

/** Append-only JSON-Lines (z. B. Industrial Memory, Audit). */
export async function appendLine(tenant: string, name: string, obj: unknown): Promise<void> {
  if (!NAME_RE.test(name)) throw new Error(`Ungültiger Store-Name: ${name}`);
  const f = path.join(tenantDir(tenant), `${name}.jsonl`);
  const prev = chains.get(f) ?? Promise.resolve();
  const run = prev.then(async () => {
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.appendFile(f, JSON.stringify(obj) + "\n", "utf8");
  });
  chains.set(f, run.catch(() => undefined));
  return run;
}

export async function readLines<T>(tenant: string, name: string): Promise<T[]> {
  if (!NAME_RE.test(name)) throw new Error(`Ungültiger Store-Name: ${name}`);
  const f = path.join(tenantDir(tenant), `${name}.jsonl`);
  await (chains.get(f) ?? Promise.resolve());
  try {
    const raw = await fs.readFile(f, "utf8");
    const out: T[] = [];
    for (const l of raw.split("\n")) {
      if (!l.trim()) continue;
      try { out.push(JSON.parse(l)); } catch { /* defekte Zeile ignorieren */ }
    }
    return out;
  } catch {
    return [];
  }
}

/** Nur für Tests. */
export function __resetTenantCache() {
  cache.clear();
  chains.clear();
}
