import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { listSapActions, decideSapAction } from "@/lib/sap/actions";
import { getBrain } from "@/lib/server/brain";
import { sapAdapterFor } from "@/lib/sap/adapter";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

/** Freigabe + Ausführung (oder Ablehnung) einer vorbereiteten SAP-Aktion. Vier-Augen-Prinzip. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireCap("sap.execute");
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const { decision, confirm } = await body<{ decision?: string; confirm?: boolean }>(req);
    const action = (await listSapActions(auth.session.tenant)).find((a) => a.id === id);
    if (!action) return NextResponse.json({ error: "SAP-Aktion unbekannt" }, { status: 404 });
    if (decision === "reject") {
      const a = await decideSapAction(auth.session.tenant, id, auth.session.sub, { reject: true });
      await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "sap.rejected", target: id });
      return NextResponse.json({ action: a });
    }
    if (decision !== "execute" || confirm !== true) return NextResponse.json({ error: "decision=execute und confirm=true erforderlich" }, { status: 400 });
    if (action.preparedBy === auth.session.sub) return NextResponse.json({ error: "Vier-Augen-Prinzip: Freigabe durch eine andere Person erforderlich" }, { status: 409 });
    const b = await getBrain(auth.session.tenant);
    const result = await sapAdapterFor(b.g).createNotification(action.draft);
    const a = await decideSapAction(auth.session.tenant, id, auth.session.sub, { result });
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "sap.executed", target: id, detail: `${result.mode}: ${result.message}`, ok: result.ok });
    return NextResponse.json({ action: a });
  });
}
