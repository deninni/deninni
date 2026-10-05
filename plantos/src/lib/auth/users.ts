import "server-only";
import type { Role } from "./roles";
export { hasRole, can, ROLE_LABEL, type Role } from "./roles";

export interface DemoUser {
  email: string;
  name: string;
  role: Role;
  tenant: string;
  password: string;
}

const pw = (fallback: string) => process.env.PLANTOS_DEMO_PASSWORD || fallback;

/** Demo-Benutzer (lokal, nur Server). Zeigen RBAC und Mandantentrennung. Produktiv: SSO/OIDC. */
export function demoUsers(): DemoUser[] {
  return [
    { email: "demo@plantos.local", name: "Demo Admin", role: "admin", tenant: "demo", password: pw("plantos-demo") },
    { email: "werkleiter@plantos.local", name: "Werkleitung Nord", role: "plant_manager", tenant: "demo", password: pw("plantos-werkleiter") },
    { email: "instandhaltung@plantos.local", name: "Instandhaltung", role: "maintenance", tenant: "demo", password: pw("plantos-instandhaltung") },
    { email: "schicht@plantos.local", name: "Schichtleitung", role: "operator", tenant: "demo", password: pw("plantos-schicht") },
    { email: "viewer@plantos.local", name: "Viewer (lesend)", role: "viewer", tenant: "demo", password: pw("plantos-viewer") },
    { email: "admin@acme.test", name: "ACME Admin", role: "admin", tenant: "acme", password: pw("plantos-acme") },
  ];
}
