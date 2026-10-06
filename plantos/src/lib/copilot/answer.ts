import { sampleMachine, kpis, type Snapshot } from "../demo/engine";
import { MACHINES, type MachineId, getMachine } from "../plants";
import { runRca, rcaTicketTitle } from "../rca/rules";
import { assessConnector, tt214ExampleInput } from "../diagnostics/connector-suspicion";
import { classifyPlantScope, wantsTicketFromRca, PLANT_SCOPE_REFUSAL, CONTROL_REFUSAL } from "./scope";
import type { Ticket } from "../store/store";
import type { Alert } from "../alerts";

export const LOCAL_MODEL_NOTE =
  "Lokales, regelbasiertes Anlagenmodell aus plantOS-Daten (Messwerte, Meldungen, RCA). Kein Cloud-LLM, keine Daten verlassen das Werk.";

export interface CopilotContext {
  now?: number;
  tickets: Ticket[];
  alerts: Alert[];
  snapshotFor?: (id: MachineId) => Snapshot;
}

export interface CopilotAnswer {
  kind: "answer" | "refusal" | "control-refusal" | "ticket-request";
  text: string;
  machineId: MachineId | null;
  sources: string[];
  ticketRequest?: { title: string; description: string; machineId: string };
}

const fmt = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

export function detectMachine(q: string): MachineId | null {
  const t = q.toLowerCase();
  if (/af-?12|abfüll|abfuell|füller|fueller|sternrad|m-?001|tt-?214|verschließ|etikett|spüler/.test(t)) return "m-af12";
  if (/vl-?3|verpack|shrink|tunnel|folie/.test(t)) return "m-vl3";
  if (/ft-?7|förder|foerder|sorter|segment|a3/.test(t)) return "m-ft7";
  return null;
}

export function answerLocal(q: string, ctx: CopilotContext): CopilotAnswer {
  const scope = classifyPlantScope(q);
  if (scope === "control") return { kind: "control-refusal", text: CONTROL_REFUSAL, machineId: null, sources: ["Trust: Supervised"] };
  if (scope === "offtopic") return { kind: "refusal", text: PLANT_SCOPE_REFUSAL, machineId: null, sources: [] };

  const now = ctx.now ?? Date.now();
  const snap = ctx.snapshotFor ?? ((id: MachineId) => sampleMachine(id, now));
  const mid = detectMachine(q);
  const t = q.toLowerCase();

  if (wantsTicketFromRca(q)) {
    const target = mid ?? worstMachine(snap);
    const s = snap(target);
    const rca = runRca(s);
    const top = rca.hypotheses[0];
    if (!top) {
      return { kind: "answer", machineId: target, sources: ["RCA Regelbaum"], text: `${rca.machineCode}: RCA findet aktuell keine Ursache. Kein Ticket angelegt.` };
    }
    return {
      kind: "ticket-request",
      machineId: target,
      sources: ["RCA Regelbaum", `Messwerte ${rca.machineCode}`],
      text: `Ticket aus RCA für ${rca.machineCode}: „${top.title}“ (Konfidenz ${top.confidence}).`,
      ticketRequest: {
        title: rcaTicketTitle(rca.machineCode, top),
        description: [`Evidenz: ${top.evidence.join("; ")}`, `Prüfschritte: ${top.checks.join("; ")}`, "Erzeugt vom Anlagen-Copilot (Trust: Supervised)."].join("\n"),
        machineId: target,
      },
    };
  }

  if (/stecker|tt-?214|oxid|korrod/.test(t)) {
    const r = assessConnector(tt214ExampleInput());
    if (r.ok) {
      return { kind: "answer", machineId: "m-af12", sources: ["Stecker-Verdacht TT-214 (DEMO-Fixture)"], text: `${r.nachricht}\nScore ${r.score}, Stufe ${r.stufe}. ${r.naechsterSchritt}\n(DEMO-Fixture, keine Live-SPS.)` };
    }
  }

  if (/ticket/.test(t)) {
    const open = ctx.tickets.filter((x) => x.status !== "DONE" && (!mid || x.machineId === mid));
    if (!open.length) return { kind: "answer", machineId: mid, sources: ["Tickets"], text: "Keine offenen Tickets." };
    return {
      kind: "answer", machineId: mid, sources: ["Tickets"],
      text: `${open.length} offene Tickets:\n` + open.slice(0, 6).map((x) => `• ${x.title} (${x.status}${x.reportCount > 1 ? `, ${x.reportCount}× gemeldet` : ""})`).join("\n"),
    };
  }

  if (/oee|verfügbarkeit|verfuegbarkeit|leistung|qualität|qualitaet|ausbringung/.test(t)) {
    const ids = mid ? [mid] : MACHINES.map((m) => m.id);
    const lines = ids.map((id) => {
      const k = kpis(id, now);
      const m = getMachine(id)!;
      return `• ${m.code}: OEE ${fmt(k.oeePct)} % (V ${fmt(k.availabilityPct)} · L ${fmt(k.performancePct)} · Q ${fmt(k.qualityPct)}) · ${k.goodUnits.toLocaleString("de-DE")} Gutteile`;
    });
    return { kind: "answer", machineId: mid, sources: ["OEE aus Demo-Engine, letzte 8 h"], text: `OEE laufende Schicht (8 h):\n${lines.join("\n")}` };
  }

  if (/warum|ursache|rca|grund|wieso/.test(t)) {
    const target = mid ?? worstMachine(snap);
    const rca = runRca(snap(target));
    if (!rca.hypotheses.length) return { kind: "answer", machineId: target, sources: ["RCA Regelbaum"], text: `${rca.machineCode}: ${rca.note}` };
    const top = rca.hypotheses.slice(0, 2);
    return {
      kind: "answer", machineId: target, sources: ["RCA Regelbaum", `Messwerte ${rca.machineCode}`],
      text: `${rca.machineCode} – wahrscheinlichste Ursache (Heuristik):\n` + top.map((h) => `• ${h.title} (${h.confidence})\n  Evidenz: ${h.evidence.join(", ")}\n  Prüfen: ${h.checks[0]}`).join("\n") + `\n${rca.note}\nTipp: „Ticket aus RCA“ legt ein Ticket an.`,
    };
  }

  if (/meldung|alarm|alert|störung|stoerung/.test(t)) {
    const act = ctx.alerts.filter((a) => a.active && (!mid || a.machineId === mid));
    if (!act.length) return { kind: "answer", machineId: mid, sources: ["Meldungen"], text: "Keine aktiven Meldungen." };
    return { kind: "answer", machineId: mid, sources: ["Meldungen"], text: `${act.length} aktive Meldungen:\n` + act.map((a) => `• ${a.machineCode} ${a.severity}: ${a.title}`).join("\n") };
  }

  // Status
  const ids = mid ? [mid] : MACHINES.map((m) => m.id);
  const lines = ids.map((id) => {
    const s = snap(id);
    const m = getMachine(id)!;
    const sg = s.signals;
    return `• ${m.code} ${stateDe(s.state)}${s.activeIncident ? ` – ${s.activeIncident.title}` : ""}\n  ${fmt(sg.speedPercent)} % · ${fmt(sg.motorCurrentA, 1)} A · ${fmt(sg.temperatureC)} °C · ${fmt(sg.outputRate, 0)} ${m.unit}`;
  });
  return { kind: "answer", machineId: mid, sources: [`Messwerte (${snap(ids[0]).source})`], text: `Zustand jetzt:\n${lines.join("\n")}` };
}

function worstMachine(snap: (id: MachineId) => Snapshot): MachineId {
  const rank = { FAULT: 0, WARN: 1, STOPPED: 2, RUNNING: 3 } as const;
  return [...MACHINES].sort((a, b) => rank[snap(a.id).state] - rank[snap(b.id).state])[0].id;
}

export function stateDe(s: Snapshot["state"]): string {
  return s === "RUNNING" ? "läuft" : s === "WARN" ? "Warnung" : s === "FAULT" ? "Störung" : "Stillstand";
}
