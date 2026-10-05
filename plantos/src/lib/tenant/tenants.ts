/**
 * Mandanten (Tenants). Jeder Tenant hat einen eigenen Datenbereich unter data/tenants/<id>/.
 * Kein Tenant kann Daten eines anderen lesen; Cross-Plant-Learning wirkt nur innerhalb eines Tenants
 * und ist pro Tenant abschaltbar.
 */
export interface TenantConfig {
  id: string;
  name: string;
  demo: boolean;
  /** Vergleich historischer Fälle über Werke hinweg (innerhalb des Tenants). */
  crossPlantLearning: boolean;
}

export const TENANT_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export const TENANTS: TenantConfig[] = [
  { id: "demo", name: "Demo Beverages Group (DEMO)", demo: true, crossPlantLearning: true },
  { id: "acme", name: "ACME Test GmbH (DEMO, Isolationstest)", demo: true, crossPlantLearning: false },
];

export function getTenant(id: string): TenantConfig | undefined {
  return TENANTS.find((t) => t.id === id);
}

export function assertTenantId(id: string): string {
  if (!TENANT_ID_RE.test(id)) throw new Error(`Ungültige Tenant-ID: ${id}`);
  return id;
}
