import type { GraphDoc, GraphEdge, GraphNode, NodeType, EdgeType } from "./model";
import { HIERARCHY } from "./model";

/** Reine Abfragefunktionen auf einem GraphDoc (ohne I/O, gut testbar). */
export class GraphIndex {
  readonly byId = new Map<string, GraphNode>();
  readonly out = new Map<string, GraphEdge[]>();
  readonly inc = new Map<string, GraphEdge[]>();

  constructor(readonly doc: GraphDoc) {
    for (const n of doc.nodes) this.byId.set(n.id, n);
    for (const e of doc.edges) {
      (this.out.get(e.from) ?? this.out.set(e.from, []).get(e.from)!).push(e);
      (this.inc.get(e.to) ?? this.inc.set(e.to, []).get(e.to)!).push(e);
    }
  }

  node(id: string) { return this.byId.get(id); }

  parent(id: string): GraphNode | undefined {
    const e = (this.out.get(id) ?? []).find((x) => x.type === "partOf");
    return e ? this.byId.get(e.to) : undefined;
  }

  children(id: string, type?: NodeType): GraphNode[] {
    return (this.inc.get(id) ?? []).filter((e) => e.type === "partOf").map((e) => this.byId.get(e.from)!).filter((n) => n && (!type || n.type === type));
  }

  ancestors(id: string): GraphNode[] {
    const res: GraphNode[] = [];
    const seen = new Set<string>();
    let p = this.parent(id);
    while (p && !seen.has(p.id)) { res.push(p); seen.add(p.id); p = this.parent(p.id); }
    return res;
  }

  ancestorOfType(id: string, type: NodeType): GraphNode | undefined {
    const self = this.byId.get(id);
    if (self?.type === type) return self;
    return this.ancestors(id).find((a) => a.type === type);
  }

  descendants(id: string, type?: NodeType): GraphNode[] {
    const res: GraphNode[] = [];
    const stack = [id];
    const seen = new Set<string>([id]);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const c of this.children(cur)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        res.push(c);
        stack.push(c.id);
      }
    }
    return type ? res.filter((n) => n.type === type) : res;
  }

  /** Maschinen unter einem Scope (inkl. Scope selbst, falls Maschine). */
  machinesUnder(scopeId: string): GraphNode[] {
    const self = this.byId.get(scopeId);
    if (self?.type === "machine") return [self];
    return this.descendants(scopeId, "machine");
  }

  related(id: string, type?: EdgeType, dir: "out" | "in" | "both" = "both"): { edge: GraphEdge; node: GraphNode; dir: "out" | "in" }[] {
    const res: { edge: GraphEdge; node: GraphNode; dir: "out" | "in" }[] = [];
    if (dir !== "in") for (const e of this.out.get(id) ?? []) if (!type || e.type === type) { const n = this.byId.get(e.to); if (n) res.push({ edge: e, node: n, dir: "out" }); }
    if (dir !== "out") for (const e of this.inc.get(id) ?? []) if (!type || e.type === type) { const n = this.byId.get(e.from); if (n) res.push({ edge: e, node: n, dir: "in" }); }
    return res;
  }

  /** Ersatzteile einer Maschine (über alle Komponenten). */
  sparePartsOf(machineId: string): GraphNode[] {
    const ids = new Set<string>();
    for (const n of [this.byId.get(machineId)!, ...this.descendants(machineId)]) {
      if (!n) continue;
      for (const r of this.related(n.id, "usesSparePart", "out")) ids.add(r.node.id);
    }
    return [...ids].map((i) => this.byId.get(i)!);
  }

  /** Pfad als Text, z. B. „Werk Süd › Abfüllung › Linie 2 › FB03“. */
  pathOf(id: string, from: NodeType = "plant"): string {
    const chain = [this.byId.get(id), ...this.ancestors(id)].filter(Boolean) as GraphNode[];
    const idx = chain.findIndex((n) => n.type === from);
    const cut = idx >= 0 ? chain.slice(0, idx + 1) : chain;
    return cut.reverse().map((n) => n.code ?? n.name).join(" › ");
  }

  search(q: string, opts: { types?: NodeType[]; scopeId?: string; limit?: number } = {}): GraphNode[] {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scope = opts.scopeId ? new Set([opts.scopeId, ...this.descendants(opts.scopeId).map((n) => n.id)]) : null;
    const res: { n: GraphNode; score: number }[] = [];
    for (const n of this.doc.nodes) {
      if (opts.types?.length && !opts.types.includes(n.type)) continue;
      if (scope && !scope.has(n.id)) continue;
      const hay = `${n.name} ${n.code ?? ""} ${n.id} ${Object.values(n.props).filter((v) => typeof v === "string" || typeof v === "number").join(" ")}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
      const exact = terms.some((t) => (n.code ?? "").toLowerCase() === t);
      res.push({ n, score: (exact ? 10 : 0) + HIERARCHY.length - Math.max(0, HIERARCHY.indexOf(n.type)) });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 50).map((r) => r.n);
  }
}
