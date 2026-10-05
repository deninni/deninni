/**
 * Abhängigkeitsfreier PDF-1.4-Writer (Helvetica, WinAnsi). Umlaute als Oktal-Escapes,
 * Zeilenumbruch, „Seite n/m“, korrekte xref-Tabelle.
 */

const WINANSI: Record<string, number> = {
  "ä": 0xe4, "ö": 0xf6, "ü": 0xfc, "Ä": 0xc4, "Ö": 0xd6, "Ü": 0xdc, "ß": 0xdf, "é": 0xe9, "è": 0xe8,
  "€": 0x80, "–": 0x96, "—": 0x97, "„": 0x84, "“": 0x93, "”": 0x94, "‘": 0x91, "’": 0x92, "•": 0x95, "…": 0x85, "°": 0xb0, "×": 0xd7, "·": 0xb7, "²": 0xb2, "−": 0x2d,
};

export function pdfEscape(text: string): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c >= 32 && c < 127) out += ch;
    else if (WINANSI[ch] != null) out += "\\" + WINANSI[ch].toString(8).padStart(3, "0");
    else if (c >= 160 && c <= 255) out += "\\" + c.toString(8).padStart(3, "0");
    else out += "?";
  }
  return out;
}

/** Grobe Breitenabschätzung Helvetica (0,5 em mittel) für Umbruch. */
export function wrap(text: string, size: number, maxWidth: number): string[] {
  const maxChars = Math.max(10, Math.floor(maxWidth / (size * 0.5)));
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) { lines.push(""); continue; }
    const indent = para.match(/^\s*/)![0];
    let cur = "";
    for (const word of para.trim().split(/\s+/)) {
      const cand = cur ? cur + " " + word : indent + word;
      if (cand.length > maxChars && cur) {
        lines.push(cur);
        cur = indent + "  " + word;
      } else cur = cand;
    }
    lines.push(cur);
  }
  return lines;
}

export interface PdfLine {
  text: string;
  size?: number;
  bold?: boolean;
  gapBefore?: number;
}

export function renderPdf(opts: { title: string; lines: PdfLine[]; footer: string[] }): Uint8Array {
  const W = 595.28, H = 841.89, M = 50;
  const pages: string[][] = [];
  let cur: string[] = [];
  let y = H - M;
  const footerH = 16 + opts.footer.length * 10;
  const newPage = () => { pages.push(cur); cur = []; y = H - M; };

  const all: PdfLine[] = [{ text: opts.title, size: 16, bold: true }, { text: "", size: 6 }, ...opts.lines];
  for (const l of all) {
    const size = l.size ?? 10;
    y -= l.gapBefore ?? 0;
    for (const part of wrap(l.text, size, W - 2 * M)) {
      if (y - size * 1.35 < M + footerH) newPage();
      y -= size * 1.35;
      cur.push(`BT /${l.bold ? "F2" : "F1"} ${size} Tf ${M} ${y.toFixed(2)} Td (${pdfEscape(part)}) Tj ET`);
    }
  }
  pages.push(cur);

  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  const catalog = add(""); // 1
  const pagesObj = add(""); // 2
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  pages.forEach((ops, i) => {
    const foot: string[] = [];
    let fy = M - 10 + opts.footer.length * 10;
    foot.push(`0.55 0.58 0.63 RG 0.5 w ${M} ${fy + 8} m ${W - M} ${fy + 8} l S`);
    for (const f of opts.footer) {
      foot.push(`BT /F1 7.5 Tf 0.35 0.38 0.42 rg ${M} ${fy.toFixed(2)} Td (${pdfEscape(f)}) Tj ET`);
      fy -= 10;
    }
    foot.push(`BT /F1 8 Tf 0.35 0.38 0.42 rg ${W - M - 50} ${(M - 20).toFixed(2)} Td (${pdfEscape(`Seite ${i + 1}/${pages.length}`)}) Tj ET`);
    const content = ["0.1 0.12 0.15 rg", ...ops, ...foot].join("\n");
    const stream = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`));
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Producer (plantOS) /Title (${pdfEscape(opts.title)}) >>`);

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}
