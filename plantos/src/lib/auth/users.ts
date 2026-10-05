export type Role = "viewer" | "operator" | "admin";

export interface DemoUser {
  email: string;
  name: string;
  role: Role;
  password: string;
}

const pw = (fallback: string) => process.env.PLANTOS_DEMO_PASSWORD || fallback;

/** Demo-Benutzer (lokal). Rollen zeigen das RBAC-Modell für Enterprise-Piloten. */
export const DEMO_USERS: DemoUser[] = [
  { email: "demo@plantos.local", name: "Demo Admin", role: "admin", password: pw("plantos-demo") },
  { email: "schicht@plantos.local", name: "Schichtleitung", role: "operator", password: pw("plantos-schicht") },
  { email: "viewer@plantos.local", name: "Werksleitung (lesend)", role: "viewer", password: pw("plantos-viewer") },
];

const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };

export function hasRole(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}

export const ROLE_LABEL: Record<Role, string> = {
  viewer: "Lesend",
  operator: "Schicht / Instandhaltung",
  admin: "Administrator",
};
