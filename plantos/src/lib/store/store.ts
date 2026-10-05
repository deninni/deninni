import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Lokaler Datei-Store (local-first). Atomare Writes (tmp + rename) und serialisierte
 * Mutationen pro Prozess, damit parallele Requests den Store nicht korrumpieren.
 */

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING" | "DONE";

export interface Ticket {
  id: string;
  title: string;
  description: string;
  machineId: string | null;
  alertId: string | null;
  status: TicketStatus;
  priority: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  source: "manual" | "alert" | "rca" | "copilot" | "handover";
  dedupeKey: string | null;
  reportCount: number;
  lastReportedAt: string;
  mergedInto?: string;
}

export interface AlertState {
  id: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  closedAt?: string;
  closedBy?: string;
  comments: { by: string; at: string; text: string }[];
}

export interface StoreData {
  version: 1;
  tickets: Ticket[];
  alerts: Record<string, AlertState>;
}

const EMPTY: StoreData = { version: 1, tickets: [], alerts: {} };

export function dataDir(): string {
  return process.env.PLANTOS_DATA_DIR || path.join(process.cwd(), "data");
}

function storeFile() {
  return path.join(dataDir(), "plantos-store.json");
}

let cache: StoreData | null = null;
let cacheFile: string | null = null;
let chain: Promise<unknown> = Promise.resolve();

export async function readStore(): Promise<StoreData> {
  const file = storeFile();
  if (cache && cacheFile === file) return cache;
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Partial<StoreData>;
    cache = { ...EMPTY, ...raw, tickets: raw.tickets ?? [], alerts: raw.alerts ?? {} } as StoreData;
  } catch {
    cache = structuredClone(EMPTY);
  }
  cacheFile = file;
  return cache;
}

export async function writeJsonAtomic(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** Serialisierte Mutation: fn verändert den Store; Rückgabewert wird durchgereicht. */
export function mutateStore<T>(fn: (s: StoreData) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const s = await readStore();
    const result = await fn(s);
    await writeJsonAtomic(storeFile(), s);
    return result;
  });
  chain = run.catch(() => undefined);
  return run;
}

/** Nur für Tests. */
export function __resetStoreCache() {
  cache = null;
  cacheFile = null;
}
