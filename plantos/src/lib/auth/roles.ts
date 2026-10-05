/**
 * Rollen- und Rechtemodell (client-sicher – enthält keine Zugangsdaten).
 * READ ONLY gegenüber Maschinen gilt für ALLE Rollen; Rechte betreffen nur plantOS-Daten.
 */
export type Role = "viewer" | "operator" | "maintenance" | "plant_manager" | "admin";

export const ROLES: Role[] = ["viewer", "operator", "maintenance", "plant_manager", "admin"];

const RANK: Record<Role, number> = { viewer: 0, operator: 1, maintenance: 2, plant_manager: 3, admin: 4 };

export function isRole(r: unknown): r is Role {
  return typeof r === "string" && (ROLES as string[]).includes(r);
}

/** Rangfolge (für einfache „mindestens“-Prüfungen). */
export function hasRole(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}

export const ROLE_LABEL: Record<Role, string> = {
  viewer: "Viewer (lesend)",
  operator: "Operator / Schicht",
  maintenance: "Instandhalter",
  plant_manager: "Werkleiter",
  admin: "Administrator",
};

/** Fachliche Rechte. Jede schreibende API prüft genau eines davon. */
export type Capability =
  | "read"
  | "alert.ack"
  | "ticket.create"
  | "memory.comment"
  | "memory.write"
  | "graph.write"
  | "maintenance.confirm"
  | "maintenance.approve"
  | "ai.confirm"
  | "simulation.run"
  | "roi.config"
  | "sap.prepare"
  | "sap.execute"
  | "discovery.confirm"
  | "audit.read"
  | "tenant.config";

export const CAPABILITY_MIN_ROLE: Record<Capability, Role> = {
  read: "viewer",
  "simulation.run": "viewer",
  "alert.ack": "operator",
  "ticket.create": "operator",
  "memory.comment": "operator",
  "memory.write": "maintenance",
  "graph.write": "maintenance",
  "maintenance.confirm": "maintenance",
  "ai.confirm": "maintenance",
  "sap.prepare": "maintenance",
  "discovery.confirm": "maintenance",
  "maintenance.approve": "plant_manager",
  "roi.config": "plant_manager",
  "sap.execute": "plant_manager",
  "audit.read": "plant_manager",
  "tenant.config": "admin",
};

export function can(role: Role, cap: Capability): boolean {
  return hasRole(role, CAPABILITY_MIN_ROLE[cap]);
}
