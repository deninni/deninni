import type { GraphIndex } from "../graph/queries";
import type { Candidate } from "./parsers";

/**
 * Zuordnung importierter Tags zu Assets im Plant Brain. Liefert nur VORSCHLÄGE mit Confidence;
 * nichts wird automatisch übernommen. Unsichere Zuordnungen (< 0,5) sind als „unklar“ markiert.
 */
export interface Suggestion {
  candidate: Candidate;
  assetId: string | null;
  assetPath: string | null;
  confidence: number;
  status: "sicher" | "Vorschlag" | "unklar";
  reason: string;
}

const KIND_WORDS: Record<string, string[]> = {
  temperature: ["temp", "temperatur", "tt", "pt100", "therm"],
  vibration: ["vib", "schwing", "vs", "accel"],
  pressure: ["druck", "pressure", "pt-", "bar"],
  motor: ["motor", "strom", "current", "antrieb", "drive", "m"],
  presence: ["lichtschranke", "ls", "sensor", "photo"],
  valve: ["ventil", "valve", "fv"],
};

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").split(" ").filter((t) => t.length >= 2);
}

export function matchCandidates(g: GraphIndex, scopeId: string, candidates: Candidate[]): Suggestion[] {
  const pool = [g.node(scopeId)!, ...g.descendants(scopeId)].filter((n) => n && ["machine", "assembly", "component", "sensor", "actuator"].includes(n.type));
  return candidates.map((c) => {
    if (!c.valid) return { candidate: c, assetId: null, assetPath: null, confidence: 0, status: "unklar", reason: c.error ?? "ungültig" };
    const ct = new Set(tokens(`${c.name} ${c.deviceTag ?? ""} ${c.description ?? ""}`));
    let best: { id: string; score: number; reason: string } | null = null;
    for (const n of pool) {
      const code = (n.code ?? "").toLowerCase();
      let score = 0;
      let reason = "";
      const dev = (c.deviceTag ?? c.name).toLowerCase();
      if (code && (dev === code || dev === code.replace(/^(vs|tt|pt)-/, ""))) { score = 0.95; reason = `Kennzeichen „${c.deviceTag ?? c.name}“ = ${n.code}`; }
      else {
        const nt = new Set(tokens(`${n.name} ${n.code ?? ""}`));
        const inter = [...ct].filter((t) => nt.has(t)).length;
        const jac = inter / Math.max(1, new Set([...ct, ...nt]).size);
        score = jac * 0.8;
        const kind = String(n.props.kind ?? "");
        if (kind && KIND_WORDS[kind]?.some((w) => [...ct].some((t) => t.startsWith(w)))) score += 0.15;
        reason = inter ? `gemeinsame Begriffe: ${[...ct].filter((t) => nt.has(t)).join(", ")}` : kind ? `Typ passt (${kind})` : "schwache Übereinstimmung";
      }
      if (!best || score > best.score) best = { id: n.id, score, reason };
    }
    const conf = Math.round(Math.min(1, best?.score ?? 0) * 100) / 100;
    return {
      candidate: c, assetId: best && conf >= 0.3 ? best.id : null, assetPath: best && conf >= 0.3 ? g.pathOf(best.id) : null, confidence: conf,
      status: conf >= 0.8 ? "sicher" : conf >= 0.5 ? "Vorschlag" : "unklar", reason: best?.reason ?? "kein passendes Asset",
    };
  });
}
