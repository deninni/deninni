import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { listImports, updateImport } from "@/lib/discovery/store";
import { addNode, addEdge } from "@/lib/graph/store";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

/** Vorschläge bestätigen/ablehnen. Bestätigt → SPS-Tag-Knoten + „Messwert aus“-Beziehung (Quelle: import). */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireCap("discovery.confirm");
    if ("response" in auth) return auth.response;
    const b0 = await body<{ importId?: string; decisions?: { key: string; decision: "confirmed" | "rejected"; assetId?: string }[] }>(req);
    const imp = (await listImports(auth.session.tenant)).find((x) => x.id === b0.importId);
    if (!imp) return NextResponse.json({ error: "Import unbekannt" }, { status: 404 });
    const brain = await getBrain(auth.session.tenant);
    let created = 0;
    for (const d of (b0.decisions ?? []).slice(0, 2000)) {
      const s = imp.suggestions.find((x) => x.candidate.key === d.key);
      if (!s || s.decision) continue;
      if (d.decision === "confirmed") {
        const target = d.assetId ?? s.assetId;
        if (!s.candidate.valid || !target || !brain.g.node(target)) continue;
        const machine = brain.g.ancestorOfType(target, "machine");
        const plc = machine ? brain.g.related(machine.id, "controlledBy", "out")[0]?.node : undefined;
        const tag = await addNode(auth.session.tenant, { type: "plcTag", name: s.candidate.name, code: s.candidate.address ?? s.candidate.nodeId ?? s.candidate.name, props: { address: s.candidate.address, nodeId: s.candidate.nodeId, dataType: s.candidate.dataType, description: s.candidate.description, access: "read", importId: imp.id, confidence: s.confidence }, source: "import" });
        await addEdge(auth.session.tenant, { from: target, to: tag.id, type: "measuredBy", source: "import" });
        if (plc) await addEdge(auth.session.tenant, { from: tag.id, to: plc.id, type: "tagOf", source: "import" });
        await updateImport(auth.session.tenant, imp.id, (i) => { const x = i.suggestions.find((y) => y.candidate.key === d.key)!; x.decision = "confirmed"; x.decidedBy = auth.session.sub; x.nodeId = tag.id; x.assetId = target; });
        created++;
      } else if (d.decision === "rejected") {
        await updateImport(auth.session.tenant, imp.id, (i) => { const x = i.suggestions.find((y) => y.candidate.key === d.key)!; x.decision = "rejected"; x.decidedBy = auth.session.sub; });
      }
    }
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "discovery.confirm", target: imp.id, detail: `${created} Tags übernommen` });
    return NextResponse.json({ created, import: (await listImports(auth.session.tenant)).find((x) => x.id === imp.id) });
  });
}
