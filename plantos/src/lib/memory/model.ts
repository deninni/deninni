export const MEMORY_TYPES = [
  "fault", "disturbance", "cause", "repair", "partReplacement", "technicianComment", "photo", "document",
  "measurementSnapshot", "alarmHistory", "productionParameter", "plcChange", "maintenance", "aiRecommendation",
  "humanApproval", "outcome",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_LABEL: Record<MemoryType, string> = {
  fault: "Fehler", disturbance: "Störung", cause: "Ursache", repair: "Reparatur", partReplacement: "Ersatzteilwechsel",
  technicianComment: "Technikerkommentar", photo: "Foto", document: "Dokument", measurementSnapshot: "Messwert-Snapshot",
  alarmHistory: "Alarmverlauf", productionParameter: "Produktionsparameter", plcChange: "SPS-Änderung", maintenance: "Wartung",
  aiRecommendation: "AI-Empfehlung", humanApproval: "Freigabe", outcome: "Ergebnis nach Maßnahme",
};

/** Typen, die nur Instandhaltung+ schreiben darf (Operator: Kommentare, Fotos, Störungen). */
export const OPERATOR_TYPES: MemoryType[] = ["technicianComment", "photo", "disturbance", "measurementSnapshot"];

export type MemorySource = "demo-seed" | "user" | "system" | "ai" | "sap" | "edge";

export interface MemoryEntry {
  id: string;
  tenant: string;
  assetId: string;
  /** Zeitpunkt des Ereignisses */
  at: string;
  /** Zeitpunkt der Erfassung */
  recordedAt: string;
  type: MemoryType;
  source: MemorySource;
  actor: string;
  description: string;
  meta: Record<string, unknown>;
  /** Pflicht bei AI-basierten Einträgen (0..1) */
  confidence?: number;
  links: { ticketId?: string; alarmId?: string; sapRef?: string; relatedEntryId?: string };
  /** Korrektur: neuer Eintrag ersetzt einen früheren (der bleibt erhalten) */
  supersedes?: string;
  media?: { file: string; mime: string; bytes: number; sha256: string };
  demo: boolean;
}

export function isMemoryType(t: unknown): t is MemoryType {
  return typeof t === "string" && (MEMORY_TYPES as readonly string[]).includes(t);
}
