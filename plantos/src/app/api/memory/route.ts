import { NextResponse } from "next/server";
import { requireCap, getSession } from "@/lib/auth/server";
import { getBrain } from "@/lib/server/brain";
import { addMemory } from "@/lib/memory/store";
import { isMemoryType, OPERATOR_TYPES, MEMORY_LABEL, type MemoryType } from "@/lib/memory/model";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** ?assetId=&descendants=1&type=fault,repair&q=&limit= */
export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const sp = new URL(req.url).searchParams;
    const b = await getBrain(auth.session.tenant);
    const assetId = sp.get("assetId");
    let ids: Set<string> | null = null;
    if (assetId) {
      if (!b.g.node(assetId)) return NextResponse.json({ error: "Asset unbekannt" }, { status: 404 });
      ids = new Set([assetId, ...(sp.get("descendants") === "1" ? b.g.descendants(assetId).map((n) => n.id) : [])]);
    }
    const types = (sp.get("type") ?? "").split(",").filter(isMemoryType) as MemoryType[];
    const q = sp.get("q")?.toLowerCase();
    const limit = Math.min(500, Number(sp.get("limit")) || 100);
    const entries = b.memory
      .filter((e) => (!ids || ids.has(e.assetId)) && (!types.length || types.includes(e.type)) && (!q || e.description.toLowerCase().includes(q)))
      .slice(0, limit)
      .map((e) => ({ ...e, typeLabel: MEMORY_LABEL[e.type], assetName: b.g.node(e.assetId)?.name, assetPath: b.g.pathOf(e.assetId) }));
    return NextResponse.json({ entries });
  });
}

const CAP_FOR: Partial<Record<MemoryType, "memory.comment" | "memory.write" | "maintenance.approve" | "maintenance.confirm" | "ai.confirm">> = {
  humanApproval: "maintenance.approve",
  outcome: "maintenance.confirm",
  maintenance: "maintenance.confirm",
  aiRecommendation: "ai.confirm",
};

export async function POST(req: Request) {
  return handle(async () => {
    const s = await getSession();
    if (!s) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const b = await body<{ assetId?: string; type?: string; description?: string; at?: string; meta?: Record<string, unknown>; confidence?: number; links?: Record<string, string>; supersedes?: string; photoDataUrl?: string }>(req);
    if (!isMemoryType(b.type)) return NextResponse.json({ error: "Unbekannter Eintragstyp" }, { status: 400 });
    const cap = CAP_FOR[b.type] ?? (OPERATOR_TYPES.includes(b.type) ? "memory.comment" : "memory.write");
    const auth = await requireCap(cap);
    if ("response" in auth) return auth.response;
    const links = { ticketId: b.links?.ticketId, alarmId: b.links?.alarmId, sapRef: b.links?.sapRef, relatedEntryId: b.links?.relatedEntryId };
    const entry = await addMemory(auth.session.tenant, {
      assetId: String(b.assetId ?? ""), type: b.type, description: String(b.description ?? ""), at: b.at, source: "user", actor: auth.session.sub,
      meta: b.meta && typeof b.meta === "object" ? b.meta : {}, confidence: b.confidence, links, supersedes: b.supersedes, photoDataUrl: b.photoDataUrl,
    });
    const action = b.type === "humanApproval" ? "maintenance.approved" : b.type === "maintenance" || b.type === "outcome" ? "maintenance.confirmed" : b.type === "aiRecommendation" ? "ai.recommendation.confirmed" : "memory.create";
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action, target: entry.id, detail: `${b.type} ${entry.assetId}` });
    return NextResponse.json({ entry }, { status: 201 });
  });
}
