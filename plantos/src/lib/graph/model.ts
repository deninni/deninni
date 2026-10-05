/**
 * Plant Brain – Anlagen-Wissensmodell als gerichteter, typisierter Graph.
 * Knoten und Kanten werden persistent je Tenant gespeichert (data/tenants/<t>/graph.json).
 */
export const NODE_TYPES = [
  "company", "region", "country", "site", "plant", "area", "line", "machine", "assembly", "component",
  "sensor", "actuator", "plc", "plcTag", "sapEquipment", "sapFunctionalLocation", "sapMaterial", "sparePart",
  "document", "alarm", "ticket", "maintenanceEvent", "aiInsight",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_LABEL: Record<NodeType, string> = {
  company: "Unternehmen", region: "Region", country: "Land", site: "Standort", plant: "Werk", area: "Bereich", line: "Linie",
  machine: "Maschine", assembly: "Baugruppe", component: "Komponente", sensor: "Sensor", actuator: "Aktor", plc: "SPS",
  plcTag: "SPS-Tag", sapEquipment: "SAP Equipment", sapFunctionalLocation: "SAP Technischer Platz", sapMaterial: "SAP Material",
  sparePart: "Ersatzteil", document: "Dokument", alarm: "Alarm", ticket: "Ticket", maintenanceEvent: "Wartungsereignis", aiInsight: "AI-Erkenntnis",
};

/** Hierarchie-Ebenen (partOf-Kette von oben nach unten). */
export const HIERARCHY: NodeType[] = ["company", "region", "country", "site", "plant", "area", "line", "machine", "assembly", "component", "sensor", "actuator"];

export const EDGE_TYPES = [
  "partOf",          // Kind → Eltern (Hierarchie)
  "controlledBy",    // Maschine/Komponente → SPS
  "measuredBy",      // Komponente/Sensor → SPS-Tag (Messwert kommt aus Tag)
  "tagOf",           // SPS-Tag → SPS
  "sapEquipment",    // Asset → SAP Equipment
  "sapLocation",     // Asset → SAP Technischer Platz
  "usesSparePart",   // Komponente → Ersatzteil
  "material",        // Ersatzteil → SAP Material
  "documents",       // Dokument → Asset
  "affects",         // Alarm → Asset
  "createdFrom",     // Ticket → Alarm
  "concerns",        // Ticket/Wartung/AI-Erkenntnis → Asset
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const EDGE_LABEL: Record<EdgeType, string> = {
  partOf: "gehört zu", controlledBy: "gesteuert über", measuredBy: "Messwert aus", tagOf: "Tag von", sapEquipment: "SAP Equipment",
  sapLocation: "SAP TP", usesSparePart: "verwendet Ersatzteil", material: "SAP Material", documents: "dokumentiert",
  affects: "betrifft", createdFrom: "erzeugt aus", concerns: "betrifft",
};

export type Provenance = "demo" | "import" | "user" | "system" | "sap" | "edge";

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  code?: string;
  props: Record<string, unknown>;
  source: Provenance;
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  source: Provenance;
  createdAt: string;
}

export interface GraphDoc {
  version: 1;
  tenant: string;
  seededAt: string | null;
  seedVersion?: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function isNodeType(t: unknown): t is NodeType {
  return typeof t === "string" && (NODE_TYPES as readonly string[]).includes(t);
}
export function isEdgeType(t: unknown): t is EdgeType {
  return typeof t === "string" && (EDGE_TYPES as readonly string[]).includes(t);
}

/** Maschinen-Knoten tragen Verweise auf das Telemetrie-Profil der Demo-Engine bzw. Edge-Daten. */
export interface MachineProps {
  profile: "m-af12" | "m-vl3" | "m-ft7";
  /** Werk-Nord-Bestandsanlage: identisch mit Live/Twin (m-af12 …) */
  legacyId?: string;
  offsetMin?: number;
  driftPhaseDays?: number;
  ratedCurrentA?: number;
  nominalRate?: number;
  unit?: string;
  maintenanceIntervalH?: number;
}

export interface SparePartProps {
  sapMaterial: string;
  stock: number;
  minStock: number;
  leadTimeDays: number;
  unitCost: number;
  failureModes: string[];
}
