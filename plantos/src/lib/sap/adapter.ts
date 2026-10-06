import type { GraphIndex } from "../graph/queries";
import type { SparePartProps } from "../graph/model";
import { getSecret } from "../config/secrets";

/**
 * SAP-Adapter (Plant Maintenance / Materialwirtschaft).
 * - DemoSapAdapter: liest Ersatzteilbestände aus dem Plant Brain (DEMO-Daten, klar gekennzeichnet)
 * - ODataSapAdapter: S/4HANA OData (API_EQUIPMENT, API_MATERIAL_STOCK_SRV, API_MAINTNOTIFICATION)
 *   Implementiert, kundenseitige Integration noch nicht validiert.
 * Schreibende Aktionen (Meldung anlegen) sind IMMER zweistufig: vorbereiten → Freigabe/Ausführung durch Berechtigte.
 */
export const SAP_VALIDATION_NOTE = "Implementiert, kundenseitige Integration noch nicht validiert.";

export interface MaterialStock { material: string; plant: string; stock: number; minStock?: number; leadTimeDays?: number; source: "DEMO" | "SAP" }
export interface NotificationDraft { equipment: string; functionalLocation?: string; shortText: string; longText: string; priority: "1" | "2" | "3" | "4"; notificationType: "M1" | "M2" }
export interface ExecutionResult { ok: boolean; externalId?: string; message: string; mode: "demo" | "odata" }

export interface SapAdapter {
  readonly mode: "demo" | "odata";
  readonly validated: boolean;
  materialStock(material: string, plantId: string): Promise<MaterialStock | null>;
  createNotification(draft: NotificationDraft): Promise<ExecutionResult>;
}

export class DemoSapAdapter implements SapAdapter {
  readonly mode = "demo" as const;
  readonly validated = false;
  constructor(private g: GraphIndex) {}
  async materialStock(material: string, plantId: string): Promise<MaterialStock | null> {
    const sp = this.g.doc.nodes.find((n) => n.type === "sparePart" && n.code === material && n.props.plant === plantId);
    if (!sp) return null;
    const p = sp.props as unknown as SparePartProps;
    return { material, plant: plantId, stock: p.stock, minStock: p.minStock, leadTimeDays: p.leadTimeDays, source: "DEMO" };
  }
  async createNotification(draft: NotificationDraft): Promise<ExecutionResult> {
    return { ok: true, externalId: `DEMO-${Date.now().toString(36).toUpperCase()}`, message: `DEMO: Meldung „${draft.shortText}“ nur im Demo-Adapter erfasst – kein SAP-System angebunden.`, mode: "demo" };
  }
}

export interface ODataConfig { baseUrl: string; user: string; password: string; client?: string; writeEnabled: boolean }

export function odataConfigFromEnv(): ODataConfig | null {
  const baseUrl = process.env.PLANTOS_SAP_BASE_URL;
  const user = process.env.PLANTOS_SAP_USER;
  const password = getSecret("PLANTOS_SAP_PASSWORD");
  if (!baseUrl || !user || !password) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), user, password, client: process.env.PLANTOS_SAP_CLIENT, writeEnabled: process.env.PLANTOS_SAP_WRITE_ENABLED === "true" };
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class ODataSapAdapter implements SapAdapter {
  readonly mode = "odata" as const;
  readonly validated = false;
  constructor(private cfg: ODataConfig, private fetchImpl: FetchLike = fetch) {}

  private headers(extra: Record<string, string> = {}) {
    const h: Record<string, string> = { Accept: "application/json", Authorization: "Basic " + Buffer.from(`${this.cfg.user}:${this.cfg.password}`).toString("base64"), ...extra };
    if (this.cfg.client) h["sap-client"] = this.cfg.client;
    return h;
  }

  async materialStock(material: string, plantId: string): Promise<MaterialStock | null> {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(material) || !/^[A-Za-z0-9_-]{1,10}$/.test(plantId)) throw new Error("Ungültige Material-/Werksnummer");
    const url = `${this.cfg.baseUrl}/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV/A_MatlStkInAcctMod?$filter=Material eq '${material}' and Plant eq '${plantId}'&$format=json`;
    const r = await this.fetchImpl(url, { headers: this.headers() });
    if (!r.ok) throw new Error(`SAP antwortet ${r.status}`);
    const j = (await r.json()) as { d?: { results?: { MatlWrhsStkQtyInMatlBaseUnit?: string }[] } };
    const rows = j.d?.results ?? [];
    if (!rows.length) return null;
    const stock = rows.reduce((a, x) => a + Number(x.MatlWrhsStkQtyInMatlBaseUnit ?? 0), 0);
    return { material, plant: plantId, stock, source: "SAP" };
  }

  async createNotification(draft: NotificationDraft): Promise<ExecutionResult> {
    if (!this.cfg.writeEnabled) return { ok: false, message: "Schreiben nach SAP ist deaktiviert (PLANTOS_SAP_WRITE_ENABLED ≠ true).", mode: "odata" };
    const base = `${this.cfg.baseUrl}/sap/opu/odata/sap/API_MAINTNOTIFICATION`;
    const tokenRes = await this.fetchImpl(`${base}/`, { headers: this.headers({ "x-csrf-token": "fetch" }) });
    const token = tokenRes.headers.get("x-csrf-token");
    if (!token) return { ok: false, message: "Kein CSRF-Token von SAP erhalten.", mode: "odata" };
    const body = {
      NotificationText: draft.shortText.slice(0, 40),
      MaintNotifLongTextForEdit: draft.longText.slice(0, 4000),
      NotificationType: draft.notificationType,
      MaintPriority: draft.priority,
      TechnicalObject: draft.equipment,
      TechObjIsEquipOrFuncnlLoc: "EAMS_EQUI",
    };
    const r = await this.fetchImpl(`${base}/MaintenanceNotification`, { method: "POST", headers: this.headers({ "x-csrf-token": token, "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (!r.ok) return { ok: false, message: `SAP antwortet ${r.status}`, mode: "odata" };
    const j = (await r.json()) as { d?: { MaintenanceNotification?: string } };
    return { ok: true, externalId: j.d?.MaintenanceNotification, message: "Meldung in SAP angelegt.", mode: "odata" };
  }
}

export function sapAdapterFor(g: GraphIndex): SapAdapter {
  const cfg = odataConfigFromEnv();
  return cfg ? new ODataSapAdapter(cfg) : new DemoSapAdapter(g);
}
