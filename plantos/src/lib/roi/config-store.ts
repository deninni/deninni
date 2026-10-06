import { readDoc, mutateDoc } from "../tenant/store";
import { DEMO_ROI_CONFIG, type RoiConfig } from "./engine";

export function loadRoiConfig(tenant: string): Promise<RoiConfig> {
  return readDoc<RoiConfig>(tenant, "roi-config", () => structuredClone(DEMO_ROI_CONFIG));
}

export function saveRoiConfig(tenant: string, patch: Partial<RoiConfig>, by: string): Promise<RoiConfig> {
  return mutateDoc<RoiConfig, RoiConfig>(tenant, "roi-config", () => structuredClone(DEMO_ROI_CONFIG), (c) => {
    Object.assign(c, patch, { source: "user", updatedBy: by, updatedAt: new Date().toISOString() });
    return c;
  });
}
