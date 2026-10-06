import { randomUUID } from "node:crypto";
import { readDoc, mutateDoc } from "../tenant/store";
import type { Suggestion } from "./match";
import type { DiscoveryFormat } from "./parsers";

export interface DiscoveryImport {
  id: string;
  format: DiscoveryFormat;
  scopeId: string;
  fileName: string;
  createdBy: string;
  createdAt: string;
  suggestions: (Suggestion & { decision?: "confirmed" | "rejected"; decidedBy?: string; nodeId?: string })[];
}

interface Doc { imports: DiscoveryImport[] }
const init = (): Doc => ({ imports: [] });

export async function listImports(tenant: string) {
  return [...(await readDoc<Doc>(tenant, "discovery", init)).imports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveImport(tenant: string, imp: Omit<DiscoveryImport, "id" | "createdAt">) {
  return mutateDoc<Doc, DiscoveryImport>(tenant, "discovery", init, (d) => {
    const x: DiscoveryImport = { ...imp, id: `imp-${randomUUID().slice(0, 8)}`, createdAt: new Date().toISOString() };
    d.imports.push(x);
    if (d.imports.length > 50) d.imports.shift();
    return x;
  });
}

export function updateImport(tenant: string, id: string, fn: (imp: DiscoveryImport) => void) {
  return mutateDoc<Doc, DiscoveryImport>(tenant, "discovery", init, (d) => {
    const imp = d.imports.find((x) => x.id === id);
    if (!imp) throw Object.assign(new Error("Import unbekannt"), { status: 404 });
    fn(imp);
    return imp;
  });
}
