export type ConnBadge = "DEMO" | "REACHABLE" | "CONNECTED_READ" | "ERROR" | "DISCONNECTED";

export const BADGE_TONE: Record<ConnBadge, "warn" | "accent" | "ok" | "fault" | "muted"> = {
  DEMO: "warn",
  REACHABLE: "accent",
  CONNECTED_READ: "ok",
  ERROR: "fault",
  DISCONNECTED: "muted",
};
