/** Rollenmodell (client-sicher – enthält keine Zugangsdaten). */
export type Role = "viewer" | "operator" | "admin";

const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };

export function hasRole(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}

export const ROLE_LABEL: Record<Role, string> = {
  viewer: "Lesend",
  operator: "Schicht / Instandhaltung",
  admin: "Administrator",
};
