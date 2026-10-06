import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { parseSymbolList, SYMBOL_LIST_MAX_BYTES } from "@/lib/plc/symbol-list";
import { isMachineId } from "@/lib/plants";

/** Vorschau eines Symbollisten-Imports (Textimport, nur Lesen). */
export async function POST(req: Request) {
  const auth = await requireRole("operator");
  if ("response" in auth) return auth.response;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > SYMBOL_LIST_MAX_BYTES + 4096) return NextResponse.json({ error: "Datei größer als 3 MB" }, { status: 413 });
  const b = (await req.json().catch(() => ({}))) as { text?: string; machineId?: string; multi?: boolean };
  const machineId = b.machineId && isMachineId(b.machineId) ? b.machineId : null;
  const r = parseSymbolList(String(b.text ?? ""), { defaultMachineId: machineId, multi: !!b.multi });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
