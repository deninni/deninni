import { sampleMachine, type Snapshot } from "../demo/engine";
import { MACHINES } from "../plants";
import { stateDe } from "../copilot/answer";
import { assessConnector, tt214ExampleInput } from "../diagnostics/connector-suspicion";
import type { Alert } from "../alerts";
import type { Ticket } from "../store/store";
import { TRUST_LINE } from "../brand";
import { renderPdf, type PdfLine } from "./pdf";

export const SUPERVISED_PDF_LINE = "Trust: Supervised – plantOS meldet und legt Tickets an. Keine Abschaltung, kein Sollwert, keine Bestellung ohne Freigabe.";
export const TT214_DEMO_PDF_LINE = "DEMO: TT-214 Steckerverdacht ist eine DEMO-Fixture – keine Live-SPS, kein Siemens-PDU.";

export interface HandoverLine {
  machineId: string;
  code: string;
  state: string;
  source: string;
  sourceLabel: string;
  checks: string[];
}

export interface Handover {
  generatedAt: string;
  generatedBy: string;
  shift: string;
  machines: HandoverLine[];
  openTickets: { id: string; title: string; status: string; reportCount: number }[];
  alerts: { machineCode: string; severity: string; title: string; status: string; active: boolean }[];
  connectorHint: string;
  demoNote: string;
  trust: string;
}

export function spsSourceLabel(source: Snapshot["source"]): string {
  switch (source) {
    case "S7_EDGE": return "S7_EDGE (Edge-Agent, S7-Read)";
    case "SIMULATED_EDGE": return "SIMULATED_EDGE (Edge-Agent, simuliert – kein S7)";
    case "EDGE": return "EDGE (Edge-Agent)";
    default: return "DEMO (Demo-Engine, keine Live-SPS)";
  }
}

export function currentShift(d: Date): string {
  const h = Number(new Intl.DateTimeFormat("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }).format(d));
  return h >= 6 && h < 14 ? "Frühschicht" : h >= 14 && h < 22 ? "Spätschicht" : "Nachtschicht";
}

export function buildHandover(input: {
  now?: number;
  user: string;
  tickets: Ticket[];
  alerts: Alert[];
  machineId?: string;
  snapshot?: (id: (typeof MACHINES)[number]["id"]) => Snapshot;
}): Handover {
  const now = input.now ?? Date.now();
  const snap = input.snapshot ?? ((id) => sampleMachine(id, now));
  const ms = MACHINES.filter((m) => !input.machineId || m.id === input.machineId);
  const machines = ms.map((m): HandoverLine => {
    const s = snap(m.id);
    const checks: string[] = [];
    if (s.activeIncident) checks.push(`Aktiv: ${s.activeIncident.title} – vor Ort prüfen, bevor Hardware angefasst wird.`);
    const recent = input.alerts.filter((a) => a.machineId === m.id && a.status !== "CLOSED");
    if (recent.length) checks.push(`${recent.length} offene Meldung(en) in den letzten 4 h.`);
    if (m.id === "m-af12") checks.push("TT-214: Stecker prüfen, bevor der Sensor getauscht wird (DEMO).");
    if (!checks.length) checks.push("Keine Auffälligkeit.");
    return { machineId: m.id, code: m.code, state: stateDe(s.state), source: s.source, sourceLabel: spsSourceLabel(s.source), checks };
  });
  const relevant = (mid: string | null) => !input.machineId || mid === input.machineId;
  const tt = assessConnector(tt214ExampleInput());
  return {
    generatedAt: new Date(now).toISOString(),
    generatedBy: input.user,
    shift: currentShift(new Date(now)),
    machines,
    openTickets: input.tickets.filter((t) => t.status !== "DONE" && relevant(t.machineId)).map((t) => ({ id: t.id, title: t.title, status: t.status, reportCount: t.reportCount })),
    alerts: input.alerts.filter((a) => a.status !== "CLOSED" && relevant(a.machineId)).slice(0, 12).map((a) => ({ machineCode: a.machineCode, severity: a.severity, title: a.title, status: a.status, active: a.active })),
    connectorHint: tt.ok ? tt.nachricht : "",
    demoNote: "Werte stammen aus der Demo-Engine, solange kein frisches Edge-Sample (≤ 15 s) vorliegt.",
    trust: TRUST_LINE,
  };
}

export function handoverPlainText(h: Handover): string {
  const d = new Date(h.generatedAt);
  const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(d);
  const L: string[] = [];
  L.push(`Schichtübergabe · ${h.shift} · ${when}`);
  L.push("");
  for (const m of h.machines) {
    L.push(`${m.code} – ${m.state} · Quelle ${m.source}`);
    for (const c of m.checks) L.push(`  – ${c}`);
  }
  L.push("");
  L.push(`Offene Tickets (${h.openTickets.length}):`);
  for (const t of h.openTickets) L.push(`  – ${t.title} [${t.status}]${t.reportCount > 1 ? ` ${t.reportCount}× gemeldet` : ""}`);
  if (!h.openTickets.length) L.push("  – keine");
  L.push("");
  L.push(`Meldungen (${h.alerts.length}):`);
  for (const a of h.alerts) L.push(`  – ${a.machineCode} ${a.severity}${a.active ? " (aktiv)" : ""}: ${a.title}`);
  if (!h.alerts.length) L.push("  – keine");
  L.push("");
  if (h.connectorHint) L.push(`Steckerverdacht (DEMO): ${h.connectorHint}`);
  L.push(h.demoNote);
  L.push(h.trust);
  L.push("");
  L.push(`Übergeben von: ${h.generatedBy}     Übernommen von: ______________________`);
  return L.join("\n");
}


export function handoverPdf(h: Handover): Uint8Array {
  const when = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(h.generatedAt));
  const lines: PdfLine[] = [
    { text: `${h.shift} · ${when} · erstellt von ${h.generatedBy}`, size: 9 },
    { text: "Anlagen", bold: true, size: 12, gapBefore: 10 },
  ];
  for (const m of h.machines) {
    lines.push({ text: `${m.code} – ${m.state}`, bold: true, gapBefore: 4 });
    lines.push({ text: `Datenquelle: ${m.sourceLabel}`, size: 8.5 });
    for (const c of m.checks) lines.push({ text: `• ${c}` });
  }
  lines.push({ text: `Offene Tickets (${h.openTickets.length})`, bold: true, size: 12, gapBefore: 10 });
  if (!h.openTickets.length) lines.push({ text: "keine" });
  for (const t of h.openTickets) lines.push({ text: `• ${t.title} [${t.status}]${t.reportCount > 1 ? ` · ${t.reportCount}× gemeldet` : ""}` });
  lines.push({ text: `Meldungen (${h.alerts.length})`, bold: true, size: 12, gapBefore: 10 });
  if (!h.alerts.length) lines.push({ text: "keine" });
  for (const a of h.alerts) lines.push({ text: `• ${a.machineCode} ${a.severity}${a.active ? " (aktiv)" : ""}: ${a.title} – ${a.status}` });
  if (h.connectorHint) {
    lines.push({ text: "Steckerverdacht (DEMO)", bold: true, size: 12, gapBefore: 10 });
    lines.push({ text: h.connectorHint });
  }
  lines.push({ text: h.demoNote, size: 8.5, gapBefore: 10 });
  lines.push({ text: "Übergeben von: ____________________________     Übernommen von: ____________________________", gapBefore: 28 });
  return renderPdf({ title: "Schichtübergabe · plantOS", lines, footer: [SUPERVISED_PDF_LINE, TT214_DEMO_PDF_LINE] });
}

export function handoverFilename(d: Date): string {
  const p = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `schichtuebergabe-${g("year")}-${g("month")}-${g("day")}-${g("hour")}${g("minute")}.pdf`;
}
