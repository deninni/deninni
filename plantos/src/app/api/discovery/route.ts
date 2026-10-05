import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { parseDiscovery, type DiscoveryFormat } from "@/lib/discovery/parsers";
import { matchCandidates } from "@/lib/discovery/match";
import { listImports, saveImport } from "@/lib/discovery/store";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
const FORMATS: DiscoveryFormat[] = ["io-csv", "eplan-csv", "tia", "opcua-nodeset", "opcua-edge-json"];

export async function GET() {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    return NextResponse.json({ imports: await listImports(auth.session.tenant) });
  });
}

/** Import analysieren → Zuordnungsvorschläge (nichts wird übernommen, bis bestätigt). */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireCap("graph.write");
    if ("response" in auth) return auth.response;
    const b = await body<{ format?: string; text?: string; scopeId?: string; fileName?: string }>(req);
    if (!FORMATS.includes(b.format as DiscoveryFormat)) return NextResponse.json({ error: "Format unbekannt" }, { status: 400 });
    const brain = await getBrain(auth.session.tenant);
    if (!b.scopeId || !brain.g.node(b.scopeId)) return NextResponse.json({ error: "Zielanlage (scopeId) unbekannt" }, { status: 400 });
    const parsed = parseDiscovery(b.format as DiscoveryFormat, String(b.text ?? ""));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const imp = await saveImport(auth.session.tenant, { format: b.format as DiscoveryFormat, scopeId: b.scopeId, fileName: String(b.fileName ?? "Eingabe").slice(0, 120), createdBy: auth.session.sub, suggestions: matchCandidates(brain.g, b.scopeId, parsed.candidates) });
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "discovery.import", target: imp.id, detail: `${b.format}, ${imp.suggestions.length} Kandidaten` });
    return NextResponse.json({ import: imp }, { status: 201 });
  });
}
