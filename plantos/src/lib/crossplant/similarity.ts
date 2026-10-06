import type { GraphNode } from "../graph/model";
import type { GraphIndex } from "../graph/queries";
import type { MemoryEntry } from "../memory/model";
import type { TenantConfig } from "../tenant/tenants";
import { signatureAt, SIGNATURE_FEATURES } from "../analytics/signature";
import { cosine, round } from "../analytics/stats";
import { profileOf } from "../assets/telemetry";

/**
 * Cross-Plant Learning: vergleicht den aktuellen Zustand eines Assets mit historischen Fehlerfällen.
 * - nur innerhalb EINES Tenants (Memory ist je Tenant getrennt gespeichert)
 * - werksübergreifend nur, wenn der Tenant crossPlantLearning freigegeben hat; sonst nur dasselbe Werk
 * - kein Training, kein Modell-Sharing: reiner Mustervergleich auf gespeicherten Signaturen
 */
export interface SimilarCase {
  memoryId: string;
  assetId: string;
  assetPath: string;
  plant: string;
  line: string;
  title: string;
  at: string;
  similarityPct: number;
  breakdown: { sensorPattern: number; sameMachineType: boolean; sameComponent: boolean; alarmPattern: number };
  closestFeatures: string[];
  cause: string | null;
  repair: string | null;
  demo: boolean;
}

export function findSimilarCases(tenant: TenantConfig, g: GraphIndex, memory: MemoryEntry[], asset: GraphNode, now = Date.now(), limit = 3): { cases: SimilarCase[]; scope: "tenant" | "plant"; signature: number[] } {
  const sig = signatureAt(asset, now);
  const myPlant = g.ancestorOfType(asset.id, "plant")?.id;
  const scope: "tenant" | "plant" = tenant.crossPlantLearning ? "tenant" : "plant";
  const faults = memory.filter((m) => m.tenant === tenant.id && m.type === "fault" && Array.isArray(m.meta.signature));
  const cases: SimilarCase[] = [];
  for (const f of faults) {
    const fMachine = g.ancestorOfType(f.assetId, "machine");
    if (!fMachine || fMachine.id === asset.id) continue;
    const fPlant = g.ancestorOfType(f.assetId, "plant");
    if (scope === "plant" && fPlant?.id !== myPlant) continue;
    const other = f.meta.signature as number[];
    const sensor = Math.max(0, cosine(sig, other));
    const sameType = profileOf(fMachine) === profileOf(asset);
    const comp = String(f.meta.component ?? "");
    const sameComponent = !!comp && g.descendants(asset.id).some((n) => n.props.kind === comp);
    const alarm = 1 - Math.min(1, Math.abs(sig[6] - other[6]) / Math.max(0.05, Math.abs(other[6])));
    const score = 0.7 * sensor + 0.12 * (sameType ? 1 : 0) + 0.1 * (sameComponent ? 1 : 0) + 0.08 * alarm;
    const contrib = SIGNATURE_FEATURES.map((name, i) => ({ name, d: Math.abs(sig[i] - other[i]), w: Math.abs(other[i]) })).filter((x) => x.w > 0.2).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.name);
    const related = memory.filter((m) => m.links.relatedEntryId === f.id);
    cases.push({
      memoryId: f.id,
      assetId: f.assetId,
      assetPath: g.pathOf(f.assetId),
      plant: fPlant?.name ?? "–",
      line: g.ancestorOfType(f.assetId, "line")?.name ?? "–",
      title: f.description,
      at: f.at,
      similarityPct: Math.round(score * 100),
      breakdown: { sensorPattern: round(sensor * 100, 0), sameMachineType: sameType, sameComponent, alarmPattern: round(alarm * 100, 0) },
      closestFeatures: contrib,
      cause: related.find((m) => m.type === "cause")?.description ?? null,
      repair: related.filter((m) => m.type === "repair" || m.type === "partReplacement").map((m) => m.description).join(" ") || null,
      demo: f.demo,
    });
  }
  return { cases: cases.sort((a, b) => b.similarityPct - a.similarityPct).slice(0, limit), scope, signature: sig };
}
