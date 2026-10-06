import "server-only";
import { loadGraph } from "../graph/store";
import { listMemory } from "../memory/store";
import { loadRoiConfig } from "../roi/config-store";
import type { TenantConfig } from "../tenant/tenants";
import { tenantConfig } from "../tenant/config-store";
import { predictAsset, type Prediction } from "../predictive/engine";
import { findSimilarCases } from "../crossplant/similarity";
import { valueItems } from "../roi/ledger";
import { machineMetrics, type MachineMetrics } from "../enterprise/rollup";
import type { GraphIndex } from "../graph/queries";
import type { MemoryEntry } from "../memory/model";

/**
 * Serverseitige Service-Schicht für Plant Brain, Memory und Analytik je Tenant.
 * Rechenintensive Ergebnisse werden je Tenant für einige Minuten gecacht (Schlüssel enthält Datenstand).
 */
export interface Brain {
  tenant: TenantConfig;
  g: GraphIndex;
  memory: MemoryEntry[];
}

export async function getBrain(tenantId: string): Promise<Brain> {
  const tenant = await tenantConfig(tenantId);
  const [g, memory] = await Promise.all([loadGraph(tenantId), listMemory(tenantId)]);
  return { tenant, g, memory };
}

const cache = new Map<string, { key: string; value: unknown }>();
function cached<T>(name: string, key: string, fn: () => T): T {
  const hit = cache.get(name);
  if (hit && hit.key === key) return hit.value as T;
  const value = fn();
  cache.set(name, { key, value });
  return value;
}

const bucket = (ms: number) => Math.floor(Date.now() / ms);

export function predictionsFor(b: Brain): Prediction[] {
  const key = `${bucket(600_000)}:${b.memory.length}:${b.g.doc.nodes.length}:${b.tenant.crossPlantLearning}`;
  return cached(`pred:${b.tenant.id}`, key, () => {
    const now = Date.now();
    return b.g.machinesUnder(b.g.doc.nodes.find((n) => n.type === "company")?.id ?? "").map((m) => {
      const p = predictAsset(m, b.g, b.memory, now);
      if (p.failureMode) p.explanation.similarCases = findSimilarCases(b.tenant, b.g, b.memory, m, now).cases.map((c) => ({ title: c.title, similarityPct: c.similarityPct, plant: c.plant, assetId: c.assetId, memoryId: c.memoryId }));
      return p;
    });
  });
}

export function metricsFor(b: Brain): Map<string, MachineMetrics> {
  const key = `${bucket(300_000)}:${b.memory.length}:${b.g.doc.nodes.length}`;
  return cached(`metrics:${b.tenant.id}`, key, () => {
    const preds = new Map(predictionsFor(b).map((p) => [p.assetId, p]));
    const values = valueItems(b.g, b.memory);
    const now = Date.now();
    const res = new Map<string, MachineMetrics>();
    for (const m of b.g.doc.nodes.filter((n) => n.type === "machine")) res.set(m.id, machineMetrics(m, b.g, preds.get(m.id), values, now));
    return res;
  });
}

export function companyId(b: Brain): string {
  return b.g.doc.nodes.find((n) => n.type === "company")?.id ?? "";
}

/** Scope aus Cookie/Query validieren (muss zum Tenant gehören, sonst Konzernebene). */
export function resolveScope(b: Brain, scope: string | null | undefined): string {
  return scope && b.g.node(scope) ? scope : companyId(b);
}
