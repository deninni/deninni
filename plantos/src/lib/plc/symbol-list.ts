import { isS7Address } from "./edge-protocol";
import { checkTagName } from "./tag-write-guard";
import { MACHINES } from "../plants";

/**
 * SPS-Symbolliste: Textimport (TIA/Step7-CSV oder Klartext). Kein TIA-Online, kein OCR, kein S7-Read.
 */
export const SYMBOL_LIST_HONESTY = "Symbolliste-Textimport · kein TIA-Online · kein OCR · kein S7-Read";
export const SYMBOL_LIST_MAX_BYTES = 3 * 1024 * 1024;

export interface SymbolRow {
  line: number;
  name: string;
  address: string;
  dataType: string;
  comment: string;
  machineId: string | null;
  valid: boolean;
  error?: string;
}

export interface SymbolParseResult {
  ok: boolean;
  error?: string;
  rows: SymbolRow[];
  validCount: number;
  invalidCount: number;
  honesty: string;
}

const DATATYPES = /^(BOOL|BYTE|WORD|DWORD|INT|DINT|UINT|UDINT|REAL|LREAL|TIME|STRING|CHAR|SINT|USINT)$/i;

function resolveMachine(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim().toLowerCase();
  const m = MACHINES.find((x) => x.id === t || x.code.toLowerCase() === t || x.name.toLowerCase() === t);
  return m?.id ?? null;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseSymbolList(text: string, opts: { defaultMachineId?: string | null; multi?: boolean } = {}): SymbolParseResult {
  if (Buffer.byteLength(text, "utf8") > SYMBOL_LIST_MAX_BYTES) {
    return { ok: false, error: "Datei größer als 3 MB", rows: [], validCount: 0, invalidCount: 0, honesty: SYMBOL_LIST_HONESTY };
  }
  if (text.startsWith("%PDF") || /[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 2000))) {
    return { ok: false, error: "PDF/Binärdatei abgelehnt – bitte Symbolliste als CSV/Text exportieren", rows: [], validCount: 0, invalidCount: 0, honesty: SYMBOL_LIST_HONESTY };
  }
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.find((l) => l.trim()) ?? "";
  const sep = first.includes(";") ? ";" : first.includes("\t") ? "\t" : ",";
  let header: string[] | null = null;
  const rows: SymbolRow[] = [];

  lines.forEach((raw, idx) => {
    if (!raw.trim() || raw.trim().startsWith("//") || raw.trim().startsWith("#")) return;
    const cols = splitLine(raw, sep);
    if (!header && cols.some((c) => /^(name|symbol|adresse|address|datentyp|data ?type)$/i.test(c))) {
      header = cols.map((c) => c.toLowerCase());
      return;
    }
    const get = (names: string[], fallback: number) => {
      if (header) {
        const i = header.findIndex((h) => names.includes(h));
        return i >= 0 ? cols[i] ?? "" : "";
      }
      return cols[fallback] ?? "";
    };
    const name = get(["name", "symbol"], 0).replace(/^"|"$/g, "");
    const address = get(["adresse", "address", "operand"], 1).replace(/^%/, "");
    const dataType = get(["datentyp", "datatype", "data type", "typ"], 2);
    const comment = get(["kommentar", "comment"], 3);
    const plant = header ? get(["anlage", "machine", "plant"], -1) : "";
    const machineId = opts.multi ? resolveMachine(plant) : opts.defaultMachineId ?? null;

    let error: string | undefined;
    if (!name) error = "Name fehlt";
    else if (!isS7Address(address)) error = `Adresse „${address}“ ungültig`;
    else if (dataType && !DATATYPES.test(dataType)) error = `Datentyp „${dataType}“ unbekannt`;
    else if (!checkTagName(name).ok) error = "Name hat Schreib-Form (nur Lesen erlaubt)";
    else if (opts.multi && !machineId) error = `Anlage „${plant || "–"}“ unbekannt`;
    rows.push({ line: idx + 1, name, address, dataType: dataType.toUpperCase(), comment, machineId, valid: !error, error });
  });

  const validCount = rows.filter((r) => r.valid).length;
  return { ok: true, rows, validCount, invalidCount: rows.length - validCount, honesty: SYMBOL_LIST_HONESTY };
}
