import { round } from "../analytics/stats";

/**
 * ROI-Engine: wirtschaftlicher Nutzen von Maßnahmen.
 * Alle Annahmen sind konfigurierbar und werden mit Herkunft ausgegeben. Demo-Standardwerte sind
 * ausdrücklich als DEMO-Annahmen gekennzeichnet – niemals als realisierte Einsparung.
 */
export interface RoiConfig {
  currency: "EUR" | "USD";
  productionValuePerHour: number;
  downtimeCostPerHour: number;
  unitValue: number;
  scrapCostPerUnit: number;
  energyPricePerKwh: number;
  maintenanceCostPerHour: number;
  laborCostPerHour: number;
  sparePartsCostFactor: number;
  source: "demo-default" | "user";
  updatedBy?: string;
  updatedAt?: string;
  plantOverrides: Record<string, Partial<Pick<RoiConfig, "downtimeCostPerHour" | "energyPricePerKwh" | "laborCostPerHour" | "productionValuePerHour">>>;
}

export const DEMO_ROI_CONFIG: RoiConfig = {
  currency: "EUR",
  productionValuePerHour: 18000,
  downtimeCostPerHour: 12500,
  unitValue: 0.32,
  scrapCostPerUnit: 0.21,
  energyPricePerKwh: 0.19,
  maintenanceCostPerHour: 85,
  laborCostPerHour: 62,
  sparePartsCostFactor: 1,
  source: "demo-default",
  plantOverrides: { "pl-atl": { energyPricePerKwh: 0.11, laborCostPerHour: 58 }, "pl-posen": { energyPricePerKwh: 0.16, laborCostPerHour: 34, downtimeCostPerHour: 9000 } },
};

export const CONFIG_FIELDS: { key: keyof RoiConfig; label: string; unit: string; min: number; max: number }[] = [
  { key: "productionValuePerHour", label: "Produktionswert pro Stunde", unit: "€/h", min: 0, max: 1e7 },
  { key: "downtimeCostPerHour", label: "Kosten pro Stillstandsstunde", unit: "€/h", min: 0, max: 1e7 },
  { key: "unitValue", label: "Stückwert", unit: "€", min: 0, max: 1e5 },
  { key: "scrapCostPerUnit", label: "Ausschusskosten pro Einheit", unit: "€", min: 0, max: 1e5 },
  { key: "energyPricePerKwh", label: "Energiepreis", unit: "€/kWh", min: 0, max: 10 },
  { key: "maintenanceCostPerHour", label: "Wartungskosten pro Stunde", unit: "€/h", min: 0, max: 1e5 },
  { key: "laborCostPerHour", label: "Personalkosten pro Stunde", unit: "€/h", min: 0, max: 1e5 },
  { key: "sparePartsCostFactor", label: "Ersatzteilkosten-Faktor", unit: "×", min: 0, max: 10 },
];

export function validateConfigPatch(patch: Record<string, unknown>): { ok: true; value: Partial<RoiConfig> } | { ok: false; error: string } {
  const out: Partial<RoiConfig> = {};
  for (const [k, v] of Object.entries(patch)) {
    const f = CONFIG_FIELDS.find((x) => x.key === k);
    if (!f) return { ok: false, error: `Unbekanntes Feld ${k}` };
    const n = Number(v);
    if (!Number.isFinite(n) || n < f.min || n > f.max) return { ok: false, error: `${f.label}: ungültiger Wert` };
    (out as Record<string, number>)[k] = n;
  }
  return { ok: true, value: out };
}

export function effectiveConfig(cfg: RoiConfig, plantId?: string): RoiConfig {
  return plantId && cfg.plantOverrides[plantId] ? { ...cfg, ...cfg.plantOverrides[plantId] } : cfg;
}

export interface Scenario {
  title: string;
  kind: "predictive" | "anomaly" | "quality" | "energy" | "maintenance";
  /** Eintrittswahrscheinlichkeit des Schadensereignisses im Horizont ohne Maßnahme (0..1) */
  probability: number;
  horizonDays: number;
  downtimeHoursIfEvent: number;
  scrapUnitsIfEvent?: number;
  /** Folgeschaden (z. B. Motor statt Lager) in Teilekosten */
  secondaryDamageCost?: number;
  /** zusätzlicher Energieverbrauch im Horizont ohne Maßnahme */
  extraEnergyKwh?: number;
  /** laufender Mehrausschuss im Horizont ohne Maßnahme (Einheiten) */
  extraScrapUnits?: number;
  action: {
    maintenanceHours: number;
    technicians: number;
    partsCost: number;
    plannedDowntimeHours: number;
    inPlannedWindow: boolean;
  };
  /** Restwahrscheinlichkeit nach Maßnahme (Default 10 % der Ausgangswahrscheinlichkeit) */
  residualProbability?: number;
  /** Confidence der zugrundeliegenden Analyse (0..1) */
  analysisConfidence: number;
}

export interface Assumption {
  name: string;
  value: string;
  origin: "DEMO-Annahme" | "Konfiguration" | "Analyse" | "Messwert";
}

export interface RoiResult {
  title: string;
  kind: Scenario["kind"];
  currency: string;
  costIfNoAction: number;
  costOfAction: number;
  avoidedCost: number;
  netBenefit: number;
  roiPct: number | null;
  confidence: number;
  confidenceLabel: "hoch" | "mittel" | "niedrig";
  assumptions: Assumption[];
  breakdown: Record<string, number>;
  demo: boolean;
}

export function evaluateScenario(s: Scenario, cfg: RoiConfig): RoiResult {
  const p = Math.max(0, Math.min(1, s.probability));
  const residual = Math.max(0, Math.min(p, s.residualProbability ?? p * 0.1));
  const eventCost = s.downtimeHoursIfEvent * cfg.downtimeCostPerHour + (s.scrapUnitsIfEvent ?? 0) * cfg.scrapCostPerUnit + (s.secondaryDamageCost ?? 0) * cfg.sparePartsCostFactor;
  const ongoing = (s.extraEnergyKwh ?? 0) * cfg.energyPricePerKwh + (s.extraScrapUnits ?? 0) * cfg.scrapCostPerUnit;
  const costNoAction = p * eventCost + ongoing;

  const labor = s.action.maintenanceHours * s.action.technicians * (cfg.maintenanceCostPerHour + cfg.laborCostPerHour);
  const parts = s.action.partsCost * cfg.sparePartsCostFactor;
  const plannedDowntime = s.action.inPlannedWindow ? 0 : s.action.plannedDowntimeHours * cfg.downtimeCostPerHour;
  const residualCost = residual * eventCost;
  const costAction = labor + parts + plannedDowntime + residualCost;

  const avoided = costNoAction - residualCost;
  const net = costNoAction - costAction;
  const demo = cfg.source === "demo-default";
  const confidence = Math.max(0, Math.min(1, s.analysisConfidence * (demo ? 0.7 : 1)));
  const cur = cfg.currency === "USD" ? "$" : "€";
  const fmt = (n: number) => `${round(n, 2).toLocaleString("de-DE")} ${cur}`;
  const cfgOrigin = demo ? "DEMO-Annahme" : "Konfiguration";

  return {
    title: s.title,
    kind: s.kind,
    currency: cfg.currency,
    costIfNoAction: round(costNoAction, 0),
    costOfAction: round(costAction, 0),
    avoidedCost: round(avoided, 0),
    netBenefit: round(net, 0),
    roiPct: costAction > 0 ? round((net / costAction) * 100, 0) : null,
    confidence: round(confidence, 2),
    confidenceLabel: confidence >= 0.75 ? "hoch" : confidence >= 0.5 ? "mittel" : "niedrig",
    demo,
    breakdown: { eventCost: round(eventCost, 0), ongoingCost: round(ongoing, 0), labor: round(labor, 0), parts: round(parts, 0), plannedDowntime: round(plannedDowntime, 0), residualRisk: round(residualCost, 0) },
    assumptions: [
      { name: "Eintrittswahrscheinlichkeit ohne Maßnahme", value: `${round(p * 100, 0)} % in ${s.horizonDays} Tagen`, origin: "Analyse" },
      { name: "Restrisiko nach Maßnahme", value: `${round(residual * 100, 1)} %`, origin: s.residualProbability != null ? "Analyse" : "DEMO-Annahme" },
      { name: "Stillstand bei Ereignis", value: `${s.downtimeHoursIfEvent} h`, origin: "DEMO-Annahme" },
      { name: "Kosten pro Stillstandsstunde", value: fmt(cfg.downtimeCostPerHour), origin: cfgOrigin },
      { name: "Wartung + Personal je Stunde", value: fmt(cfg.maintenanceCostPerHour + cfg.laborCostPerHour), origin: cfgOrigin },
      { name: "Energiepreis", value: `${cfg.energyPricePerKwh.toLocaleString("de-DE")} ${cur}/kWh`, origin: cfgOrigin },
      { name: "Ausschusskosten je Einheit", value: fmt(cfg.scrapCostPerUnit), origin: cfgOrigin },
      { name: "Maßnahme im geplanten Fenster", value: s.action.inPlannedWindow ? "ja (kein zusätzlicher Produktionsverlust)" : "nein", origin: "Analyse" },
    ],
  };
}
