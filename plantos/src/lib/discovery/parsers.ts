import { parseSymbolList } from "../plc/symbol-list";
import { isS7Address } from "../plc/edge-protocol";
import { checkTagName } from "../plc/tag-write-guard";

/**
 * Sichere Discovery – nur Dateiimporte und vom Edge gemeldete Browse-Ergebnisse.
 * Keine Netzwerkscans, keine Schreibzugriffe. Formate: IO-Liste (CSV aus Excel), EPLAN-Betriebsmittel-CSV,
 * TIA/Step7-Symbolliste, OPC-UA-NodeSet2-XML (Export) bzw. JSON aus Edge-Browse.
 */
export type DiscoveryFormat = "io-csv" | "eplan-csv" | "tia" | "opcua-nodeset" | "opcua-edge-json";

export interface Candidate {
  key: string;
  name: string;
  address?: string;
  nodeId?: string;
  dataType?: string;
  description?: string;
  deviceTag?: string;
  location?: string;
  valid: boolean;
  error?: string;
}

const MAX = 3 * 1024 * 1024;

function splitCsv(line: string, sep: string): string[] {
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

function table(text: string): { header: string[]; rows: string[][] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const sep = (lines[0] ?? "").includes(";") ? ";" : (lines[0] ?? "").includes("\t") ? "\t" : ",";
  const [h, ...rest] = lines;
  return { header: splitCsv(h ?? "", sep).map((x) => x.toLowerCase()), rows: rest.map((l) => splitCsv(l, sep)) };
}

/** EPLAN-BMK „=AF24+S1-M12“ → Anlage AF24, Ort S1, Betriebsmittel M12 */
export function parseBmk(bmk: string): { plant?: string; location?: string; device?: string } {
  const plant = /=([A-Za-z0-9_.]+)/.exec(bmk)?.[1];
  const location = /\+([A-Za-z0-9_.]+)/.exec(bmk)?.[1];
  const device = /-([A-Za-z0-9_.]+)\s*$/.exec(bmk)?.[1];
  return { plant, location, device };
}

export function parseDiscovery(format: DiscoveryFormat, text: string): { ok: boolean; error?: string; candidates: Candidate[] } {
  if (Buffer.byteLength(text, "utf8") > MAX) return { ok: false, error: "Datei größer als 3 MB", candidates: [] };
  if (text.startsWith("PK\u0003\u0004")) return { ok: false, error: "Excel-Datei (.xlsx) direkt wird nicht gelesen – bitte in Excel „Speichern unter → CSV (Trennzeichen-getrennt)“", candidates: [] };
  if (text.startsWith("%PDF") || /[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 2000))) return { ok: false, error: "Binärdatei abgelehnt – bitte Text/CSV/XML exportieren", candidates: [] };

  const cands: Candidate[] = [];
  const push = (c: Omit<Candidate, "valid" | "key"> & { error?: string }) => {
    let error = c.error;
    if (!error && c.name && !checkTagName(c.name).ok) error = "Name hat Schreib-Form – nur lesende Tags werden übernommen";
    if (!error && c.address && !isS7Address(c.address)) error = `Adresse „${c.address}“ ungültig`;
    cands.push({ ...c, key: `${cands.length + 1}:${c.name}`, valid: !error, error });
  };

  if (format === "tia") {
    const r = parseSymbolList(text);
    if (!r.ok) return { ok: false, error: r.error, candidates: [] };
    for (const row of r.rows) push({ name: row.name, address: row.address, dataType: row.dataType, description: row.comment, error: row.error });
  } else if (format === "io-csv") {
    const { header, rows } = table(text);
    const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
    const iName = idx(["bmk", "tag", "name", "symbol", "betriebsmittel"]), iAddr = idx(["adresse", "address", "operand", "e/a-adresse"]), iType = idx(["typ", "type", "datentyp", "datatype"]), iDesc = idx(["beschreibung", "kommentar", "comment", "description", "funktionstext"]);
    if (iName < 0) return { ok: false, error: "Spalte BMK/Tag/Name fehlt", candidates: [] };
    for (const r of rows) {
      const raw = r[iName] ?? "";
      const bmk = parseBmk(raw);
      push({ name: bmk.device ?? raw, deviceTag: bmk.device, location: bmk.location, address: iAddr >= 0 ? (r[iAddr] || undefined)?.replace(/^%/, "").replace(/\s+/g, "") : undefined, dataType: iType >= 0 ? r[iType] : undefined, description: iDesc >= 0 ? r[iDesc] : undefined });
    }
  } else if (format === "eplan-csv") {
    const { header, rows } = table(text);
    const iBmk = header.findIndex((h) => h.includes("betriebsmittelkennzeichen") || h === "bmk" || h.includes("device tag"));
    const iDesc = header.findIndex((h) => h.includes("funktionstext") || h.includes("bezeichnung") || h.includes("description"));
    const iType = header.findIndex((h) => h.includes("artikel") || h.includes("typ") || h.includes("part"));
    const iAddr = header.findIndex((h) => h.includes("sps-adresse") || h.includes("plc address") || h === "adresse");
    if (iBmk < 0) return { ok: false, error: "Spalte „Betriebsmittelkennzeichen“ fehlt (EPLAN-Export)", candidates: [] };
    for (const r of rows) {
      const bmk = parseBmk(r[iBmk] ?? "");
      if (!bmk.device) continue;
      push({ name: bmk.device, deviceTag: bmk.device, location: [bmk.plant, bmk.location].filter(Boolean).join("+"), description: iDesc >= 0 ? r[iDesc] : undefined, dataType: iType >= 0 ? r[iType] : undefined, address: iAddr >= 0 && r[iAddr] ? r[iAddr].replace(/^%/, "").replace(/\s+/g, "") : undefined });
    }
  } else if (format === "opcua-nodeset") {
    if (!/<UANodeSet[\s>]/.test(text)) return { ok: false, error: "Kein OPC-UA-NodeSet2-XML (UANodeSet fehlt)", candidates: [] };
    const re = /<UAVariable\b([^>]*)>([\s\S]*?)<\/UAVariable>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const attr = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(m![1])?.[1];
      const display = /<DisplayName[^>]*>([^<]*)<\/DisplayName>/.exec(m[2])?.[1];
      const desc = /<Description[^>]*>([^<]*)<\/Description>/.exec(m[2])?.[1];
      const access = Number(attr("AccessLevel") ?? 1);
      push({ name: display ?? (attr("BrowseName") ?? "").replace(/^\d+:/, ""), nodeId: attr("NodeId"), dataType: attr("DataType"), description: desc ?? (access & 2 ? "schreibbar in OPC UA – plantOS liest nur" : undefined) });
    }
  } else if (format === "opcua-edge-json") {
    let arr: unknown;
    try { arr = JSON.parse(text); } catch { return { ok: false, error: "Ungültiges JSON", candidates: [] }; }
    if (!Array.isArray(arr)) return { ok: false, error: "Erwartet: Array von Knoten", candidates: [] };
    for (const x of arr.slice(0, 20000) as Record<string, unknown>[]) push({ name: String(x.displayName ?? x.browseName ?? ""), nodeId: String(x.nodeId ?? ""), dataType: x.dataType ? String(x.dataType) : undefined, description: x.description ? String(x.description) : undefined });
  } else {
    return { ok: false, error: "Unbekanntes Format", candidates: [] };
  }
  return { ok: true, candidates: cands };
}
