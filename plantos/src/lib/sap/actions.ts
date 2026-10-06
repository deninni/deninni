import { randomUUID } from "node:crypto";
import { readDoc, mutateDoc } from "../tenant/store";
import type { NotificationDraft, ExecutionResult } from "./adapter";

/** Vorbereitete SAP-Aktionen (zweistufig: vorbereitet → ausgeführt nach Freigabe). Nie gelöscht. */
export interface SapAction {
  id: string;
  type: "notification";
  assetId: string;
  draft: NotificationDraft;
  status: "prepared" | "executed" | "failed" | "rejected";
  preparedBy: string;
  preparedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  result?: ExecutionResult;
  source: string;
}

interface Doc { actions: SapAction[] }
const init = (): Doc => ({ actions: [] });

export async function listSapActions(tenant: string): Promise<SapAction[]> {
  return [...(await readDoc<Doc>(tenant, "sap-actions", init)).actions].sort((a, b) => b.preparedAt.localeCompare(a.preparedAt));
}

export function prepareSapAction(tenant: string, input: { assetId: string; draft: NotificationDraft; by: string; source: string }): Promise<SapAction> {
  return mutateDoc<Doc, SapAction>(tenant, "sap-actions", init, (d) => {
    const a: SapAction = { id: `sap-${randomUUID().slice(0, 8)}`, type: "notification", assetId: input.assetId, draft: input.draft, status: "prepared", preparedBy: input.by, preparedAt: new Date().toISOString(), source: input.source };
    d.actions.push(a);
    return a;
  });
}

export function decideSapAction(tenant: string, id: string, by: string, outcome: { reject: true } | { result: ExecutionResult }): Promise<SapAction> {
  return mutateDoc<Doc, SapAction>(tenant, "sap-actions", init, (d) => {
    const a = d.actions.find((x) => x.id === id);
    if (!a) throw Object.assign(new Error("SAP-Aktion unbekannt"), { status: 404 });
    if (a.status !== "prepared") throw Object.assign(new Error("Aktion bereits entschieden"), { status: 409 });
    if (by === a.preparedBy) throw Object.assign(new Error("Vier-Augen-Prinzip: Freigabe durch eine andere Person erforderlich"), { status: 409 });
    a.decidedBy = by;
    a.decidedAt = new Date().toISOString();
    if ("reject" in outcome) a.status = "rejected";
    else { a.result = outcome.result; a.status = outcome.result.ok ? "executed" : "failed"; }
    return a;
  });
}
