import { randomUUID } from "node:crypto";
import { readDoc, mutateDoc } from "../tenant/store";
import { getTenant } from "../tenant/tenants";
import { buildDemoGraph } from "./seed";
import { GraphIndex } from "./queries";
import { isEdgeType, isNodeType, type EdgeType, type GraphDoc, type GraphEdge, type GraphNode, type NodeType, type Provenance } from "./model";

function init(tenant: string) {
  return (): GraphDoc => (getTenant(tenant)?.demo ? buildDemoGraph(tenant) : { version: 1, tenant, seededAt: null, nodes: [], edges: [] });
}

const indexCache = new WeakMap<GraphDoc, { size: number; idx: GraphIndex }>();

export async function loadGraph(tenant: string): Promise<GraphIndex> {
  const doc = await readDoc<GraphDoc>(tenant, "graph", init(tenant));
  const size = doc.nodes.length * 100003 + doc.edges.length;
  const hit = indexCache.get(doc);
  if (hit && hit.size === size) return hit.idx;
  const idx = new GraphIndex(doc);
  indexCache.set(doc, { size, idx });
  return idx;
}

export class GraphError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function addNode(tenant: string, input: { type: NodeType; name: string; code?: string; props?: Record<string, unknown>; parentId?: string; source: Provenance; id?: string }): Promise<GraphNode> {
  if (!isNodeType(input.type)) throw new GraphError("Unbekannter Knotentyp");
  const name = String(input.name ?? "").trim().slice(0, 160);
  if (!name) throw new GraphError("Name fehlt");
  return mutateDoc<GraphDoc, GraphNode>(tenant, "graph", init(tenant), (doc) => {
    const id = input.id ?? `${input.type}-${randomUUID().slice(0, 8)}`;
    if (doc.nodes.some((n) => n.id === id)) throw new GraphError("ID existiert bereits", 409);
    if (input.parentId && !doc.nodes.some((n) => n.id === input.parentId)) throw new GraphError("Elternknoten unbekannt", 404);
    const at = new Date().toISOString();
    const node: GraphNode = { id, type: input.type, name, code: input.code?.slice(0, 60), props: input.props ?? {}, source: input.source, createdAt: at };
    doc.nodes.push(node);
    if (input.parentId) doc.edges.push({ id: `e:${id}:partOf:${input.parentId}`, from: id, to: input.parentId, type: "partOf", source: input.source, createdAt: at });
    return node;
  });
}

export async function addEdge(tenant: string, input: { from: string; to: string; type: EdgeType; source: Provenance }): Promise<GraphEdge> {
  if (!isEdgeType(input.type)) throw new GraphError("Unbekannter Beziehungstyp");
  if (input.from === input.to) throw new GraphError("Selbstbezug nicht erlaubt");
  return mutateDoc<GraphDoc, GraphEdge>(tenant, "graph", init(tenant), (doc) => {
    // Mandantentrennung: beide Enden müssen im Graphen DIESES Tenants existieren
    if (!doc.nodes.some((n) => n.id === input.from) || !doc.nodes.some((n) => n.id === input.to)) throw new GraphError("Knoten unbekannt", 404);
    const id = `e:${input.from}:${input.type}:${input.to}`;
    const existing = doc.edges.find((e) => e.id === id);
    if (existing) return existing;
    if (input.type === "partOf" && doc.edges.some((e) => e.from === input.from && e.type === "partOf")) throw new GraphError("Knoten hat bereits ein übergeordnetes Element", 409);
    const edge: GraphEdge = { id, from: input.from, to: input.to, type: input.type, source: input.source, createdAt: new Date().toISOString() };
    doc.edges.push(edge);
    return edge;
  });
}

export async function updateNodeProps(tenant: string, id: string, patch: Record<string, unknown>): Promise<GraphNode> {
  return mutateDoc<GraphDoc, GraphNode>(tenant, "graph", init(tenant), (doc) => {
    const n = doc.nodes.find((x) => x.id === id);
    if (!n) throw new GraphError("Knoten unbekannt", 404);
    n.props = { ...n.props, ...patch };
    return n;
  });
}

/** Alarm/Ticket aus dem Betrieb im Graphen verknüpfen (Alarm betrifft Asset, Ticket erzeugt aus Alarm). */
export async function linkAlarmTicket(tenant: string, input: { assetId: string; alarmId?: string | null; alarmTitle?: string; ticketId?: string; ticketTitle?: string }): Promise<boolean> {
  const g = await loadGraph(tenant);
  if (!g.node(input.assetId)) return false;
  if (input.alarmId && !g.node(`alarm:${input.alarmId}`)) {
    await addNode(tenant, { id: `alarm:${input.alarmId}`, type: "alarm", name: input.alarmTitle ?? input.alarmId, code: input.alarmId, source: "system" });
    await addEdge(tenant, { from: `alarm:${input.alarmId}`, to: input.assetId, type: "affects", source: "system" });
  }
  if (input.ticketId && !g.node(`ticket:${input.ticketId}`)) {
    await addNode(tenant, { id: `ticket:${input.ticketId}`, type: "ticket", name: input.ticketTitle ?? input.ticketId, code: input.ticketId, source: "system" });
    await addEdge(tenant, { from: `ticket:${input.ticketId}`, to: input.assetId, type: "concerns", source: "system" });
    if (input.alarmId) await addEdge(tenant, { from: `ticket:${input.ticketId}`, to: `alarm:${input.alarmId}`, type: "createdFrom", source: "system" });
  }
  return true;
}

/** Twin-/Layout-Komponente einer Bestandsanlage auf den Plant-Brain-Knoten abbilden. */
export function resolveTwinComponent(g: GraphIndex, machineId: string, twinNode: string): string {
  if (g.node(`${machineId}/${twinNode}`)) return `${machineId}/${twinNode}`;
  const hit = g.descendants(machineId).find((n) => n.props.twinNode === twinNode);
  return hit?.id ?? machineId;
}
