import { readDoc, mutateDoc } from "./store";
import { getTenant, type TenantConfig } from "./tenants";

/** Tenant-Einstellungen (z. B. Cross-Plant-Learning) – überschreibbar je Tenant, persistent. */
type Override = Partial<Pick<TenantConfig, "crossPlantLearning">> & { updatedBy?: string; updatedAt?: string };

export async function tenantConfig(id: string): Promise<TenantConfig> {
  const base = getTenant(id);
  if (!base) throw new Error("Tenant unbekannt");
  const o = await readDoc<Override>(id, "tenant-config", () => ({}));
  return { ...base, ...(o.crossPlantLearning != null ? { crossPlantLearning: o.crossPlantLearning } : {}) };
}

export function setCrossPlantLearning(id: string, enabled: boolean, by: string) {
  return mutateDoc<Override, Override>(id, "tenant-config", () => ({}), (o) => {
    o.crossPlantLearning = enabled;
    o.updatedBy = by;
    o.updatedAt = new Date().toISOString();
    return o;
  });
}
