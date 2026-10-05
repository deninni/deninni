import type { Brain } from "../server/brain";
import type { Prediction } from "../predictive/engine";
import type { MachineMetrics } from "../enterprise/rollup";
import type { RoiConfig } from "../roi/engine";
import type { Ticket } from "../store/store";
import { assetKpis } from "../assets/telemetry";
import { analyzeEnergy } from "../energy/analysis";
import { valueItems, summarizeValue } from "../roi/ledger";
import { planMaintenance } from "../maintenance/planner";
import { effectiveConfig } from "../roi/engine";
import { mean, round } from "../analytics/stats";
import { renderPdf, type PdfLine } from "../handover/pdf";

/** Automatische Berichte. Jede Zahl stammt aus den Engines; DEMO-Herkunft steht im Bericht. */
export const REPORT_TYPES = {
  shift: { title: "Schichtbericht", hours: 8 },
  day: { title: "Tagesbericht", hours: 24 },
  week: { title: "Wochenbericht", hours: 168 },
  month: { title: "Monatsbericht", hours: 720 },
  maintenance: { title: "Wartungsreport", hours: 168 },
  roi: { title: "ROI-Report", hours: 8760 },
  energy: { title: "Energie-Report", hours: 168 },
  management: { title: "Management Summary", hours: 168 },
} as const;
export type ReportType = keyof typeof REPORT_TYPES;

export interface Report {
  type: ReportType;
  title: string;
  scope: string;
  generatedAt: string;
  generatedBy: string;
  period: { from: string; to: string };
  sections: { heading: string; lines: string[] }[];
  dataNote: string;
}

const eur = (n: number, cur = "EUR") => `${Math.round(n).toLocaleString("de-DE")} ${cur === "USD" ? "$" : "€"}`;
const pct = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;

export function buildReport(type: ReportType, b: Brain, ctx: { scopeId: string; preds: Prediction[]; metrics: Map<string, MachineMetrics>; cfg: RoiConfig; tickets: Ticket[]; user: string; now?: number }): Report {
  const now = ctx.now ?? Date.now();
  const spec = REPORT_TYPES[type];
  const from = now - spec.hours * 3_600_000;
  const machines = b.g.machinesUnder(ctx.scopeId);
  const ids = new Set(machines.map((m) => m.id));
  const preds = ctx.preds.filter((p) => ids.has(p.assetId)).sort((a, c) => c.riskScore - a.riskScore);
  const scopeName = b.g.node(ctx.scopeId)?.name ?? ctx.scopeId;
  const sections: Report["sections"] = [];
  const cur = ctx.cfg.currency;

  const oeeSection = () => {
    const step = spec.hours <= 24 ? 5 : spec.hours <= 168 ? 15 : 60;
    const rows = machines.map((m) => ({ m, k: assetKpis(m, now, spec.hours * 60, step) }));
    sections.push({
      heading: `OEE (${spec.hours <= 24 ? `${spec.hours} h` : `${Math.round(spec.hours / 24)} Tage`})`,
      lines: [`Durchschnitt ${pct(round(mean(rows.map((r) => r.k.oeePct)), 1))} über ${rows.length} Maschinen`, ...rows.sort((a, c) => a.k.oeePct - c.k.oeePct).map((r) => `${r.m.code} (${b.g.ancestorOfType(r.m.id, "plant")?.name}): OEE ${pct(r.k.oeePct)} · V ${pct(r.k.availabilityPct)} · L ${pct(r.k.performancePct)} · Q ${pct(r.k.qualityPct)}`)],
    });
  };
  const stopsSection = () => {
    const ms = machines.map((m) => ctx.metrics.get(m.id)!).filter(Boolean);
    sections.push({ heading: "Stillstände & Alarme (24 h)", lines: [`Stillstand gesamt ${ms.reduce((a, m) => a + m.stopMinutes24h, 0)} min, ${ms.reduce((a, m) => a + m.alarms24h, 0)} Alarmfenster`, ...ms.sort((a, c) => c.stopMinutes24h - a.stopMinutes24h).slice(0, 5).map((m) => `${m.code}: ${m.stopMinutes24h} min Stillstand, ${m.alarms24h} Alarme`)] });
  };
  const riskSection = () => sections.push({ heading: "Top-Risiken (Predictive)", lines: preds.filter((p) => p.priority !== "P4").slice(0, 6).map((p) => `${p.priority} ${p.code} (${b.g.ancestorOfType(p.assetId, "plant")?.name}): Risiko ${p.riskScore}/100${p.failureMode ? `, ${p.failureMode}` : ""}. ${p.rulText} Confidence ${p.explanation.confidence.label}.`).concat(preds.every((p) => p.priority === "P4") ? ["Keine Maschine mit erhöhtem Risiko."] : []) });
  const maintSection = () => {
    const plan = planMaintenance(b.g, preds, ctx.cfg, now);
    sections.push({ heading: "Wartungsplanung (Vorschläge, nicht gebucht)", lines: plan.length ? plan.map((i) => `${i.priority} ${i.code}: ${i.failureMode} · ${i.slotType}${i.recommendedStart ? ` ab ${new Date(i.recommendedStart).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}` : ""} · ${i.durationHours} h, ${i.technicians} Techniker · Teile: ${i.parts.map((p) => `${p.qty}× ${p.material}${p.available ? "" : p.transfer ? ` (Umlagerung aus ${p.transfer.fromPlant})` : " FEHLT"}`).join(", ") || "–"} · Risiko bei 7 T. Verschiebung ${pct(i.failureRiskIfPostponed7dPct)} · Netto-Nutzen ${eur(i.cost.netBenefit, cur)}${i.cost.demo ? " (DEMO-Annahmen)" : ""}`) : ["Keine Wartung erforderlich."] });
  };
  const valueSection = () => {
    const s = summarizeValue(valueItems(b.g, b.memory), new Set([ctx.scopeId, ...b.g.descendants(ctx.scopeId).map((n) => n.id)]), now);
    const p = s.periods;
    sections.push({ heading: "plantOS Value Generated", lines: [
      `Realisiert (verifiziert): Monat ${eur(p.month.realized, cur)} · Jahr ${eur(p.year.realized, cur)}`,
      `DEMO-Werte (nicht real): Monat ${eur(p.month.realizedDemo, cur)} · Jahr ${eur(p.year.realizedDemo, cur)}`,
      `Freigegeben, Ergebnis ausstehend: ${eur(p.year.approved + p.year.approvedDemo, cur)}${p.year.approvedDemo ? " (inkl. DEMO)" : ""}`,
      ...s.items.filter((i) => i.kind === "realized").slice(0, 6).map((i) => `${new Date(i.at).toLocaleDateString("de-DE")}: ${b.g.node(i.machineId ?? i.assetId)?.code ?? ""} ${eur(i.amount, cur)}${i.demo ? " (DEMO)" : ""} – ${i.description}`),
    ] });
  };
  const energySection = (days: number) => {
    const rows = machines.map((m) => analyzeEnergy(m, effectiveConfig(ctx.cfg, b.g.ancestorOfType(m.id, "plant")?.id).energyPricePerKwh, now, days));
    const pot = rows.flatMap((r) => r.potentials.map((p) => ({ code: r.code, ...p }))).sort((a, c) => c.costPerYear - a.costPerYear);
    sections.push({ heading: `Energie (${days} Tage)`, lines: [
      `Verbrauch ${Math.round(rows.reduce((a, r) => a + r.totalKwh, 0)).toLocaleString("de-DE")} kWh, Ø ${Math.round(rows.reduce((a, r) => a + r.kwhPerDay, 0)).toLocaleString("de-DE")} kWh/Tag`,
      ...rows.sort((a, c) => c.kwhPerDay - a.kwhPerDay).slice(0, 6).map((r) => `${r.code}: ${r.kwhPerDay.toLocaleString("de-DE")} kWh/Tag, Leerlauf ${pct(r.idleSharePct)}, Spitze ${r.peak15minKw.toLocaleString("de-DE")} kW${r.istVsSollPct != null ? `, Ist/Soll +${pct(r.istVsSollPct)}` : ""}`),
      ...pot.slice(0, 4).map((p) => `Potenzial ${p.code}: ${p.title} ≈ ${eur(p.costPerYear, cur)}/Jahr (Schätzung; ${p.assumption}). Risiko: ${p.risk}`),
    ] });
  };
  const ticketSection = () => {
    const open = ctx.tickets.filter((t) => t.status !== "DONE");
    sections.push({ heading: `Offene Maßnahmen / Tickets (${open.length})`, lines: open.length ? open.slice(0, 10).map((t) => `${t.title} [${t.status}]`) : ["keine"] });
  };

  switch (type) {
    case "shift": oeeSection(); stopsSection(); riskSection(); ticketSection(); break;
    case "day": oeeSection(); stopsSection(); riskSection(); energySection(1); ticketSection(); break;
    case "week": oeeSection(); riskSection(); maintSection(); energySection(7); valueSection(); break;
    case "month": oeeSection(); riskSection(); maintSection(); energySection(14); valueSection(); break;
    case "maintenance": riskSection(); maintSection(); break;
    case "roi": valueSection(); maintSection(); break;
    case "energy": energySection(7); break;
    case "management": {
      const ms = machines.map((m) => ctx.metrics.get(m.id)!).filter(Boolean);
      sections.push({ heading: "Kernaussagen", lines: [
        `${ms.length} Maschinen, OEE Ø ${pct(round(mean(ms.map((m) => m.oeePct)), 1))} (8 h)`,
        `${ms.filter((m) => m.predictiveAlert).length} Predictive-Alerts (P1/P2), ${ms.filter((m) => m.maintenanceDue14d).length} Wartungen in 14 Tagen fällig`,
        `${ms.reduce((a, m) => a + m.sparePartsBelowMin, 0)} Ersatzteilpositionen unter Mindestbestand`,
        `Energie ${Math.round(ms.reduce((a, m) => a + m.energyKwh24h, 0)).toLocaleString("de-DE")} kWh in 24 h`,
      ] });
      riskSection(); valueSection(); ticketSection();
      break;
    }
  }
  return {
    type, title: `${spec.title} · ${scopeName}`, scope: ctx.scopeId, generatedAt: new Date(now).toISOString(), generatedBy: ctx.user,
    period: { from: new Date(from).toISOString(), to: new Date(now).toISOString() }, sections,
    dataNote: "Datenquelle: plantOS-Demo-Engine (DEMO) – keine Live-SPS. ROI mit " + (ctx.cfg.source === "demo-default" ? "DEMO-Annahmen" : "konfigurierten Annahmen") + ". Prognosen sind Heuristiken mit ausgewiesener Confidence.",
  };
}

export function reportPdf(r: Report): Uint8Array {
  const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });
  const lines: PdfLine[] = [{ text: `Zeitraum ${when(r.period.from)} – ${when(r.period.to)} · erstellt von ${r.generatedBy}`, size: 9 }];
  for (const s of r.sections) {
    lines.push({ text: s.heading, bold: true, size: 12, gapBefore: 10 });
    for (const l of s.lines) lines.push({ text: `• ${l}`, size: 9.5 });
  }
  lines.push({ text: r.dataNote, size: 8, gapBefore: 12 });
  return renderPdf({ title: r.title, lines, footer: ["plantOS · READ ONLY gegenüber Maschinen · Trust: Supervised", "Berichtswerte aus plantOS-Engines; DEMO-Daten sind als solche gekennzeichnet."] });
}
