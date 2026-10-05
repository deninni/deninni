import type { Brain } from "../server/brain";
import type { Prediction } from "../predictive/engine";
import type { MachineMetrics } from "../enterprise/rollup";
import type { RoiConfig } from "../roi/engine";
import type { Ticket } from "../store/store";
import type { Alert } from "../alerts";
import type { GraphNode, SparePartProps } from "../graph/model";
import type { PlanItem } from "../maintenance/planner";
import type { SimilarCase } from "../crossplant/similarity";
import { assetSnapshot, assetActiveIncident } from "../assets/telemetry";
import { effectiveConfig } from "../roi/engine";
import { MEMORY_LABEL } from "../memory/model";
import { stateDe } from "./answer";

/**
 * Copilot-Erweiterung: Antworten ausschließlich aus plantOS-Daten (Plant Brain, Industrial Memory,
 * Telemetrie, Meldungen, SAP-Bestand, Tickets, Predictive, ROI). Jede Antwort nennt ihre Quellen.
 * Wenn Daten fehlen, sagt der Copilot das – er erfindet nichts.
 */
export interface EnterpriseCtx {
  brain: Brain;
  preds: Prediction[];
  metrics: Map<string, MachineMetrics>;
  plan: () => PlanItem[];
  energy: () => { code: string; assetId: string; potentials: { title: string; costPerYear: number; assumption: string }[]; kwhPerDay: number; idleSharePct: number }[];
  similar: (m: GraphNode) => SimilarCase[];
  cfg: RoiConfig;
  tickets: Ticket[];
  alerts: Alert[];
  scopeId: string;
  now?: number;
}

export interface EnterpriseAnswer { text: string; sources: string[]; assetId?: string }

const eur = (n: number, cfg: RoiConfig) => `${Math.round(n).toLocaleString("de-DE")} ${cfg.currency === "USD" ? "$" : "€"}`;
const pct = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;

/** Maschinen-/Asset-Code aus der Frage im Plant Brain finden (z. B. „AF-24“, „FB03“, „M12“). */
export function findAsset(q: string, b: Brain): GraphNode | null {
  const words = q.toUpperCase().match(/[A-Z]{1,3}-?\d{1,4}[A-Z]?/g) ?? [];
  for (const w of words) {
    const norm = (s: string) => s.replace(/-/g, "");
    const hit = b.g.doc.nodes.find((n) => n.code && norm(n.code.toUpperCase()) === norm(w) && ["machine", "component", "sensor", "actuator", "assembly"].includes(n.type));
    if (hit) return hit;
  }
  return null;
}

export function answerEnterprise(q: string, ctx: EnterpriseCtx): EnterpriseAnswer | null {
  const t = q.toLowerCase();
  const b = ctx.brain;
  const inScope = new Set(b.g.machinesUnder(ctx.scopeId).map((m) => m.id));
  const preds = ctx.preds.filter((p) => inScope.has(p.assetId));
  const asset = findAsset(q, b);
  const machine = asset ? b.g.ancestorOfType(asset.id, "machine") ?? null : null;
  const plantOf = (id: string) => b.g.ancestorOfType(id, "plant")?.name ?? "";

  // 1) Warum steht Maschine X?
  if (machine && /(warum|wieso|weshalb).*(steht|stillstand|stopp|aus|störung|stoerung|auffällig)|steht .* warum/.test(t)) {
    const s = assetSnapshot(machine, ctx.now);
    const inc = assetActiveIncident(machine, ctx.now);
    const p = ctx.preds.find((x) => x.assetId === machine.id);
    const sub = new Set([machine.id, ...b.g.descendants(machine.id).map((n) => n.id)]);
    const recent = b.memory.filter((m) => sub.has(m.assetId) && ["fault", "disturbance", "cause", "technicianComment"].includes(m.type)).slice(0, 3);
    const lines = [`${machine.code} (${plantOf(machine.id)}): Zustand ${stateDe(s.state)} (Quelle ${s.source}).`];
    if (s.state === "STOPPED") lines.push("Geplanter Kurzstopp laut Produktionsplan (Formatwechsel/Reinigung) – keine Störung.");
    if (inc) lines.push(`Aktive Meldung: ${inc.title} (${inc.severity}).`);
    if (s.state === "RUNNING" && !inc) lines.push("Die Maschine steht laut aktuellen Daten nicht.");
    if (p?.failureMode) lines.push(`Predictive: ${p.failureMode}, Risiko ${p.riskScore}/100 (${p.priority}). ${p.rulText}`);
    if (recent.length) lines.push("Letzte Einträge im Industrial Memory:", ...recent.map((m) => `• ${new Date(m.at).toLocaleDateString("de-DE")} ${MEMORY_LABEL[m.type]}: ${m.description}${m.demo ? " (DEMO)" : ""}`));
    return { text: lines.join("\n"), sources: ["Telemetrie (DEMO-Engine)", "Meldungen", "Predictive Engine", "Industrial Memory"], assetId: machine.id };
  }

  // 8) Welche Maschine ähnelt einem früheren Ausfall?
  if (/(ähnel|aehnel|ähnlich|aehnlich|vergleich).*(ausfall|fehler|fall|schaden)|früher.*ausfall/.test(t)) {
    const targets = machine ? [machine] : preds.filter((p) => p.priority !== "P4").map((p) => b.g.node(p.assetId)!).slice(0, 4);
    const rows = targets.flatMap((m) => ctx.similar(m).filter((c) => c.similarityPct >= 60).slice(0, 1).map((c) => ({ m, c })));
    if (!rows.length) return { text: "Keine Maschine ähnelt aktuell einem gespeicherten Ausfall (≥ 60 %).", sources: ["Cross-Plant Learning", "Industrial Memory"] };
    return {
      text: rows.map(({ m, c }) => `${m.code} (${plantOf(m.id)}) ähnelt zu ${c.similarityPct} % dem Fall „${c.title}“ – ${c.plant}, ${c.line}${c.demo ? " (DEMO)" : ""}.\n  Gemeinsam: ${c.closestFeatures.join(", ") || "Sensormuster"}. ${c.cause ? `Ursache damals: ${c.cause}` : ""}${c.repair ? ` Maßnahme: ${c.repair}` : ""}`).join("\n") + (b.tenant.crossPlantLearning ? "" : "\nHinweis: werksübergreifender Vergleich ist für diesen Mandanten deaktiviert."),
      sources: ["Cross-Plant Learning", "Industrial Memory", "Telemetrie (DEMO-Engine)"], assetId: rows[0].m.id,
    };
  }

  // 2) Welche Maschinen sind aktuell kritisch?
  if (/kritisch|gefährdet|gefaehrdet|höchste[ns]? risiko|top.?risik/.test(t)) {
    const crit = preds.filter((p) => p.priority === "P1" || p.priority === "P2");
    const faults = [...inScope].map((id) => ctx.metrics.get(id)).filter((m) => m && m.state === "FAULT") as MachineMetrics[];
    if (!crit.length && !faults.length) return { text: "Aktuell keine Maschine kritisch (kein P1/P2-Risiko, keine Störung).", sources: ["Predictive Engine", "Telemetrie"] };
    return {
      text: [...faults.map((m) => `• ${m.code}: aktuell Störung`), ...crit.map((p) => `• ${p.priority} ${p.code} (${plantOf(p.assetId)}): Risiko ${p.riskScore}/100, ${p.failureMode ?? "–"}. ${p.rulText} Confidence ${p.explanation.confidence.label}.`)].join("\n"),
      sources: ["Predictive Engine", "Telemetrie (DEMO-Engine)"], assetId: crit[0]?.assetId,
    };
  }

  // 3) Welche Ersatzteile fehlen?
  if (/ersatzteil|teile fehlen|lagerbestand|bestand|material/.test(t)) {
    const plan = ctx.plan().filter((i) => inScope.has(i.assetId));
    const needed = plan.flatMap((i) => i.parts.filter((p) => !p.available).map((p) => `• Für ${i.code} (${i.plant}): ${p.qty}× SAP ${p.material} ${p.name} – Bestand ${p.stock}, Lieferzeit ${p.leadTimeDays} Tage (benötigt für ${i.failureMode})`));
    const scopeNode = b.g.node(ctx.scopeId);
    const plantsInScope = new Set(scopeNode?.type === "plant" ? [scopeNode.id] : [...b.g.descendants(ctx.scopeId, "plant").map((p) => p.id), b.g.ancestorOfType(ctx.scopeId, "plant")?.id].filter(Boolean) as string[]);
    const below = b.g.doc.nodes.filter((n) => n.type === "sparePart" && plantsInScope.has(String(n.props.plant))).filter((n) => { const p = n.props as unknown as SparePartProps; return p.stock < p.minStock; });
    const lines = needed.length ? ["Für geplante Wartungen fehlen:", ...needed] : ["Für die vorgeschlagenen Wartungen sind alle Teile vorrätig."];
    if (below.length) lines.push("Unter Mindestbestand:", ...below.slice(0, 8).map((n) => { const p = n.props as unknown as SparePartProps; return `• ${b.g.node(String((n.props as Record<string, unknown>).plant))?.name}: ${n.name} (SAP ${p.sapMaterial}) ${p.stock}/${p.minStock}`; }));
    return { text: lines.join("\n") + "\n(Bestände aus SAP-Demo-Adapter – keine Live-SAP-Daten.)", sources: ["SAP (Demo-Adapter)", "Wartungsplaner", "Plant Brain"] };
  }

  // 4) Welche Linie verursacht die meisten Kosten?
  if (/linie.*(kost|teuer|verlust)|(kost|teuer|verlust).*linie/.test(t)) {
    const byLine = new Map<string, { name: string; cost: number; stop: number; scrap: number; energy: number }>();
    for (const id of inScope) {
      const m = ctx.metrics.get(id); const node = b.g.node(id)!;
      if (!m) continue;
      const line = b.g.ancestorOfType(id, "line");
      const cfg = effectiveConfig(ctx.cfg, b.g.ancestorOfType(id, "plant")?.id);
      const nominal = Number(node.props.nominalRate ?? 100);
      const stopCost = (m.stopMinutes24h / 60) * cfg.downtimeCostPerHour;
      const scrapCost = ((100 - m.qualityPct) / 100) * nominal * 60 * 24 * (m.availabilityPct / 100) * cfg.scrapCostPerUnit;
      const energyCost = m.energyKwh24h * cfg.energyPricePerKwh;
      const key = line?.id ?? id;
      const e = byLine.get(key) ?? { name: `${plantOf(id)} · ${line?.name ?? node.code}`, cost: 0, stop: 0, scrap: 0, energy: 0 };
      e.stop += stopCost; e.scrap += scrapCost; e.energy += energyCost; e.cost += stopCost + scrapCost + energyCost;
      byLine.set(key, e);
    }
    const rows = [...byLine.values()].sort((a, c) => c.cost - a.cost);
    return {
      text: "Kosten der letzten 24 h je Linie (Stillstand + Ausschuss + Energie):\n" + rows.slice(0, 5).map((r, i) => `${i + 1}. ${r.name}: ${eur(r.cost, ctx.cfg)} (Stillstand ${eur(r.stop, ctx.cfg)}, Ausschuss ${eur(r.scrap, ctx.cfg)}, Energie ${eur(r.energy, ctx.cfg)})`).join("\n") + `\nAnnahmen: ${ctx.cfg.source === "demo-default" ? "DEMO-Kostensätze" : "konfigurierte Kostensätze"} aus der ROI-Konfiguration. Geplante Stopps sind enthalten.`,
      sources: ["Telemetrie (DEMO-Engine)", "ROI-Konfiguration", "Plant Brain"],
    };
  }

  // 5) Welche Fehler wiederholen sich?
  if (/wiederhol|häufig|haeufig|immer wieder|wiederkehr/.test(t)) {
    const sevenDays = (ctx.now ?? Date.now()) - 7 * 86_400_000;
    const counts = new Map<string, { title: string; machines: Set<string>; n: number }>();
    for (const a of ctx.alerts) {
      if (Date.parse(a.startedAt) < sevenDays) continue;
      const e = counts.get(a.code) ?? { title: a.title, machines: new Set(), n: 0 };
      e.n++; e.machines.add(a.machineCode); counts.set(a.code, e);
    }
    const mem = new Map<string, number>();
    for (const m of b.memory) if ((m.type === "fault" || m.type === "disturbance") && inScope.has(b.g.ancestorOfType(m.assetId, "machine")?.id ?? "")) {
      const k = `${b.g.ancestorOfType(m.assetId, "machine")?.code}: ${String(m.meta.failureMode ?? m.description.split(/[.:]/)[0])}`;
      mem.set(k, (mem.get(k) ?? 0) + 1);
    }
    const lines = [...counts.entries()].sort((a, c) => c[1].n - a[1].n).slice(0, 5).map(([code, e]) => `• ${code} ${e.title}: ${e.n}× (${[...e.machines].join(", ")})`);
    const memLines = [...mem.entries()].sort((a, c) => c[1] - a[1]).slice(0, 5).map(([k, n]) => `• ${k} (${n}× im Memory)`);
    if (!lines.length && !memLines.length) return { text: "Keine wiederkehrenden Fehler gefunden.", sources: ["Meldungen", "Industrial Memory"] };
    return { text: [lines.length ? "Wiederkehrende Meldungen (Werk Nord, letzte 4 h Historie):" : "", ...lines, memLines.length ? "Fehler/Störungen im Industrial Memory:" : "", ...memLines].filter(Boolean).join("\n"), sources: ["Meldungen", "Industrial Memory"] };
  }

  // 6) Welche Wartung sollte diese Woche geplant werden?
  if (/wartung|instandhaltung|inspektion/.test(t) && /woche|planen|geplant|nächste|naechste|anstehend|fällig|faellig/.test(t)) {
    const week = (ctx.now ?? Date.now()) + 7 * 86_400_000;
    const plan = ctx.plan().filter((i) => inScope.has(i.assetId));
    const thisWeek = plan.filter((i) => i.recommendedStart && Date.parse(i.recommendedStart) <= week);
    const later = plan.filter((i) => !thisWeek.includes(i));
    if (!plan.length) return { text: "Keine Wartung aus Prognose erforderlich.", sources: ["Wartungsplaner", "Predictive Engine"] };
    const fmt = (i: PlanItem) => `• ${i.priority} ${i.code} (${i.plant}): ${i.failureMode}, ${i.slotType}${i.recommendedStart ? ` ab ${new Date(i.recommendedStart).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}, ${i.durationHours} h · Teile ${i.partsMissing ? "FEHLEN" : "vorhanden"} · Risiko bei Verschiebung um 7 T.: ${pct(i.failureRiskIfPostponed7dPct)}`;
    return { text: [thisWeek.length ? "Diese Woche:" : "Diese Woche nichts zwingend.", ...thisWeek.map(fmt), later.length ? "Später:" : "", ...later.slice(0, 4).map(fmt), "Vorschläge – Freigabe durch Werkleitung, keine automatische Buchung."].filter(Boolean).join("\n"), sources: ["Wartungsplaner", "Predictive Engine", "SAP (Demo-Adapter)"] };
  }

  // 7) Wo gibt es Energiepotenzial?
  if (/energie|strom.*(verbrauch|kosten)|verbrauch|einspar/.test(t)) {
    const rows = ctx.energy().filter((r) => inScope.has(r.assetId)).flatMap((r) => r.potentials.map((p) => ({ ...p, code: r.code }))).sort((a, c) => c.costPerYear - a.costPerYear);
    if (!rows.length) return { text: "Kein relevantes Energiepotenzial erkannt.", sources: ["Energieanalyse"] };
    return { text: "Energiepotenziale (Schätzung, keine realisierte Einsparung):\n" + rows.slice(0, 5).map((p) => `• ${p.code}: ${p.title} ≈ ${eur(p.costPerYear, ctx.cfg)}/Jahr – Annahme: ${p.assumption}`).join("\n"), sources: ["Energieanalyse (DEMO-Engine)", "ROI-Konfiguration"] };
  }

  return null;
}
