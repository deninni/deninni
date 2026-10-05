import "server-only";
import type { Role } from "./roles";
export { hasRole, ROLE_LABEL, type Role } from "./roles";

export interface DemoUser {
  email: string;
  name: string;
  role: Role;
  password: string;
}

const pw = (fallback: string) => process.env.PLANTOS_DEMO_PASSWORD || fallback;

/** Demo-Benutzer (lokal, nur Server). Rollen zeigen das RBAC-Modell für Enterprise-Piloten. */
export function demoUsers(): DemoUser[] {
  return [
    { email: "demo@plantos.local", name: "Demo Admin", role: "admin", password: pw("plantos-demo") },
    { email: "schicht@plantos.local", name: "Schichtleitung", role: "operator", password: pw("plantos-schicht") },
    { email: "viewer@plantos.local", name: "Werksleitung (lesend)", role: "viewer", password: pw("plantos-viewer") },
  ];
}
