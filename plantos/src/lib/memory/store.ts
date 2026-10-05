import { randomUUID, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { appendLine, readLines, readDoc, mutateDoc, tenantDir } from "../tenant/store";
import { getTenant } from "../tenant/tenants";
import { loadGraph } from "../graph/store";
import { isMemoryType, type MemoryEntry, type MemoryType, type MemorySource } from "./model";
import { buildDemoMemory } from "./seed";

/**
 * Industrial Memory: dauerhaftes, append-only Anlagenwissen je Tenant (memory.jsonl).
 * Einträge werden nie geändert oder gelöscht; Korrekturen sind neue Einträge mit „supersedes“.
 */
export class MemoryError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function ensureSeeded(tenant: string) {
  const meta = await readDoc<{ seeded: boolean }>(tenant, "memory-meta", () => ({ seeded: false }));
  if (meta.seeded || !getTenant(tenant)?.demo) return;
  await mutateDoc<{ seeded: boolean }, void>(tenant, "memory-meta", () => ({ seeded: false }), async (m) => {
    if (m.seeded) return;
    const g = await loadGraph(tenant);
    for (const e of buildDemoMemory(tenant, g)) await appendLine(tenant, "memory", e);
    m.seeded = true;
  });
}

export async function listMemory(tenant: string, f: { assetIds?: string[]; types?: MemoryType[]; from?: string; to?: string; q?: string; limit?: number } = {}): Promise<MemoryEntry[]> {
  await ensureSeeded(tenant);
  const all = await readLines<MemoryEntry>(tenant, "memory");
  const set = f.assetIds ? new Set(f.assetIds) : null;
  const q = f.q?.toLowerCase();
  const res = all.filter((e) => e.tenant === tenant && (!set || set.has(e.assetId)) && (!f.types?.length || f.types.includes(e.type)) && (!f.from || e.at >= f.from) && (!f.to || e.at <= f.to) && (!q || `${e.description} ${JSON.stringify(e.meta)}`.toLowerCase().includes(q)));
  res.sort((a, b) => b.at.localeCompare(a.at));
  return f.limit ? res.slice(0, f.limit) : res;
}

export async function getMemory(tenant: string, id: string): Promise<MemoryEntry | undefined> {
  return (await listMemory(tenant)).find((e) => e.id === id);
}

export interface NewMemory {
  assetId: string;
  type: MemoryType;
  description: string;
  at?: string;
  source: MemorySource;
  actor: string;
  meta?: Record<string, unknown>;
  confidence?: number;
  links?: MemoryEntry["links"];
  supersedes?: string;
  photoDataUrl?: string;
}

const MAX_PHOTO = 2 * 1024 * 1024;

export async function addMemory(tenant: string, input: NewMemory): Promise<MemoryEntry> {
  await ensureSeeded(tenant);
  if (!isMemoryType(input.type)) throw new MemoryError("Unbekannter Eintragstyp");
  const description = String(input.description ?? "").trim();
  if (description.length < 3) throw new MemoryError("Beschreibung fehlt");
  if (description.length > 4000) throw new MemoryError("Beschreibung zu lang");
  const g = await loadGraph(tenant);
  if (!g.node(input.assetId)) throw new MemoryError("Asset unbekannt", 404);
  const meta = input.meta ?? {};
  if (JSON.stringify(meta).length > 16_000) throw new MemoryError("Metadaten zu groß");
  const aiBased = input.type === "aiRecommendation" || input.source === "ai";
  if (aiBased && (typeof input.confidence !== "number" || input.confidence < 0 || input.confidence > 1)) throw new MemoryError("Confidence (0..1) ist bei AI-Einträgen Pflicht");
  if (input.supersedes && !(await getMemory(tenant, input.supersedes))) throw new MemoryError("Zu ersetzender Eintrag unbekannt", 404);
  const at = input.at ? new Date(input.at) : new Date();
  if (Number.isNaN(at.getTime())) throw new MemoryError("Zeitpunkt ungültig");

  let media: MemoryEntry["media"];
  if (input.type === "photo") {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.photoDataUrl ?? "");
    if (!m) throw new MemoryError("Foto fehlt oder Format nicht erlaubt (JPEG/PNG/WebP)");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_PHOTO) throw new MemoryError("Foto größer als 2 MB");
    const sha = createHash("sha256").update(buf).digest("hex");
    const file = `${sha.slice(0, 32)}.${m[1].split("/")[1].replace("jpeg", "jpg")}`;
    const dir = path.join(tenantDir(tenant), "media");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), buf);
    media = { file, mime: m[1], bytes: buf.length, sha256: sha };
  }

  const entry: MemoryEntry = {
    id: `mem-${randomUUID().slice(0, 12)}`,
    tenant,
    assetId: input.assetId,
    at: at.toISOString(),
    recordedAt: new Date().toISOString(),
    type: input.type,
    source: input.source,
    actor: input.actor,
    description,
    meta,
    confidence: aiBased ? input.confidence : undefined,
    links: input.links ?? {},
    supersedes: input.supersedes,
    media,
    demo: false,
  };
  await appendLine(tenant, "memory", entry);
  return entry;
}

export async function readMedia(tenant: string, file: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(file)) return null;
  try {
    return await fs.readFile(path.join(tenantDir(tenant), "media", file));
  } catch {
    return null;
  }
}
