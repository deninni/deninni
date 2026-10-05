import type { GraphIndex } from "../graph/queries";
import type { SparePartProps } from "../graph/model";
import type { Prediction } from "../predictive/engine";
import { evaluateScenario, effectiveConfig, type RoiConfig, type RoiResult } from "../roi/engine";
import { normCdf, round } from "../analytics/stats";

/**
 * Wartungsplaner: kombiniert Prognose (Risiko/Fenster), Ersatzteilbestand + Lieferzeit,
 * Produktionsplan (geplante Wartungsfenster je Werk), Wartungsdauer, Priorität und Technikerkapazität.
 * Ergebnis ist ein VORSCHLAG – keine automatische Buchung, Freigabe durch Werkleitung erforderlich.
 */
export interface PartNeed {
  sparePartId: string; material: string; name: string; qty: number; stock: number; leadTimeDays: number; available: boolean; readyAt: string; unitCost: number;
  /** Umlagerung aus einem anderen Werk desselben Mandanten (Bestand bleibt dort ≥ Mindestbestand) */
  transfer?: { fromPlant: string; fromPlantId: string; days: number; assumption: string };
}

/** Transferzeit zwischen Werken (Annahme): gleiches Land 2 T., gleiche Region 4 T., sonst 7 T. */
function transferDays(g: GraphIndex, a: string, b: string): number {
  if (g.ancestorOfType(a, "country")?.id === g.ancestorOfType(b, "country")?.id) return 2;
  if (g.ancestorOfType(a, "region")?.id === g.ancestorOfType(b, "region")?.id) return 4;
  return 7;
}

export interface PlanItem {
  assetId: string;
  code: string;
  plant: string;
  plantId: string;
  line: string;
  priority: Prediction["priority"];
  riskScore: number;
  failureMode: string;
  recommendedStart: string | null;
  recommendedEnd: string | null;
  slotType: "geplantes Wartungsfenster" | "ungeplanter Stopp" | "kein Termin im Horizont";
  deadline: string;
  parts: PartNeed[];
  partsMissing: boolean;
  technicians: number;
  durationHours: number;
  expectedDowntimeHours: number;
  failureRiskAtSlotPct: number;
  failureRiskIfPostponed7dPct: number;
  cost: RoiResult;
  reasons: string[];
  requiresApproval: true;
}

interface Window { start: number; end: number; plantId: string; techniciansFree: number }

const D = 86_400_000, H = 3_600_000;

function hourInTz(ts: number, tz: string): { weekday: number; hour: number } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(ts));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.find((x) => x.type === "weekday")!.value);
  return { weekday: wd, hour: Number(p.find((x) => x.type === "hour")!.value) };
}

export function plannedWindows(g: GraphIndex, plantId: string, from: number, days: number): Window[] {
  const plant = g.node(plantId);
  if (!plant) return [];
  const tz = String(plant.props.timezone ?? "Europe/Berlin");
  const defs = (plant.props.maintenanceWindows as { weekday: number; startH: number; durH: number }[] | undefined) ?? [];
  const techs = Number(plant.props.technicians ?? 2);
  const res: Window[] = [];
  const start = Math.ceil(from / H) * H;
  for (let t = start; t < from + days * D; t += H) {
    const { weekday, hour } = hourInTz(t, tz);
    for (const w of defs) if (w.weekday === weekday && w.startH === hour) res.push({ start: t, end: t + w.durH * H, plantId, techniciansFree: techs });
  }
  return res;
}

function failProb(p: Prediction, at: number, now: number): number {
  if (p.rul) {
    const days = (at - now) / D;
    const sigma = Math.max(1, (p.rul.range[1] - p.rul.range[0]) / 4);
    return normCdf((days - p.rul.days) / sigma);
  }
  return Math.min(0.95, (p.failureProbability30d * (at - now)) / (30 * D));
}

export function planMaintenance(g: GraphIndex, predictions: Prediction[], cfg: RoiConfig, now = Date.now(), horizonDays = 42): PlanItem[] {
  const candidates = predictions.filter((p) => p.priority !== "P4" || p.window).sort((a, b) => b.riskScore - a.riskScore);
  const windowsByPlant = new Map<string, Window[]>();
  const items: PlanItem[] = [];

  for (const p of candidates) {
    const plant = g.ancestorOfType(p.assetId, "plant");
    if (!plant) continue;
    if (!windowsByPlant.has(plant.id)) windowsByPlant.set(plant.id, plannedWindows(g, plant.id, now, horizonDays));
    const windows = windowsByPlant.get(plant.id)!;
    const reasons: string[] = [];

    const parts: PartNeed[] = g.sparePartsOf(p.assetId).filter((sp) => p.materials.includes(String(sp.code))).map((sp) => {
      const pr = sp.props as unknown as SparePartProps;
      const qty = pr.sapMaterial === "4711" ? 2 : 1;
      const available = pr.stock >= qty;
      let readyAt = available ? now : now + pr.leadTimeDays * D;
      let transfer: PartNeed["transfer"];
      if (!available) {
        // Bestand anderer Werke prüfen (nur Überbestand über Mindestbestand)
        const donors = g.doc.nodes.filter((n) => n.type === "sparePart" && n.code === pr.sapMaterial && n.props.plant !== plant.id)
          .map((n) => ({ n, p: n.props as unknown as SparePartProps, plantId: String(n.props.plant) }))
          .filter((x) => x.p.stock - qty >= x.p.minStock)
          .map((x) => ({ ...x, days: transferDays(g, plant.id, x.plantId) }))
          .sort((a, b) => a.days - b.days || b.p.stock - a.p.stock);
        const d = donors[0];
        if (d && now + d.days * D < readyAt) {
          readyAt = now + d.days * D;
          transfer = { fromPlant: g.node(d.plantId)?.name ?? d.plantId, fromPlantId: d.plantId, days: d.days, assumption: `Umlagerung ${d.days} Tage (Annahme), Bestand dort ${d.p.stock} → ${d.p.stock - qty}, Mindestbestand ${d.p.minStock} bleibt erhalten` };
        }
      }
      return { sparePartId: sp.id, material: pr.sapMaterial, name: sp.name, qty, stock: pr.stock, leadTimeDays: pr.leadTimeDays, available, readyAt: new Date(readyAt).toISOString(), unitCost: pr.unitCost, transfer };
    });
    const partsReady = Math.max(now, ...parts.map((x) => Date.parse(x.readyAt)));
    const partsMissing = parts.some((x) => !x.available);
    if (partsMissing) reasons.push(`Ersatzteil fehlt im Werk: ${parts.filter((x) => !x.available).map((x) => `${x.name} (SAP ${x.material}, Lieferzeit ${x.leadTimeDays} T.)`).join(", ")}`);
    for (const t of parts.filter((x) => x.transfer)) reasons.push(`Umlagerung vorschlagen: ${t.qty}× ${t.material} aus ${t.transfer!.fromPlant} – ${t.transfer!.assumption}`);

    const deadline = p.window ? Date.parse(p.window.to) : now + 30 * D;
    const earliestUseful = p.window ? Date.parse(p.window.from) : now;
    const dur = p.job.hours;
    const fits = (w: Window) => w.start >= partsReady && w.end - w.start >= dur * H && w.techniciansFree >= p.job.technicians;
    // Bevorzugt ein Fenster innerhalb des empfohlenen Zeitfensters (nicht unnötig früh), sonst das nächste passende
    const slot = windows.find((w) => fits(w) && w.start >= earliestUseful && w.start <= deadline) ?? windows.find(fits);

    let start: number | null = null, slotType: PlanItem["slotType"], inWindow = false;
    if (slot && slot.start <= deadline) {
      start = slot.start; slotType = "geplantes Wartungsfenster"; inWindow = true;
      slot.techniciansFree -= p.job.technicians;
      reasons.push("Termin im nächsten passenden Wartungsfenster vor Prognosegrenze");
    } else if (partsReady > deadline) {
      start = partsReady; slotType = "ungeplanter Stopp";
      reasons.push("Lieferzeit überschreitet Prognosefenster – Eilbeschaffung prüfen, Zwischeninspektion empfohlen");
    } else if (slot) {
      start = Math.max(partsReady, now); slotType = "ungeplanter Stopp";
      reasons.push("Kein Wartungsfenster vor Prognosegrenze – kurzer geplanter Stopp nötig");
    } else {
      slotType = "kein Termin im Horizont";
      reasons.push(`Kein Fenster mit ${p.job.technicians} Technikern in ${horizonDays} Tagen`);
    }

    const at = start ?? deadline;
    const riskAt = failProb(p, at, now);
    const riskLater = failProb(p, at + 7 * D, now);
    // „Nicht-Handeln“ = gar keine Maßnahme bis zum prognostizierten Ausfall (obere Prognosegrenze + 7 Tage)
    const noActionUntil = p.rul ? now + (p.rul.range[1] + 7) * D : at + 7 * D;
    const pNoAction = Math.max(failProb(p, noActionUntil, now), riskLater, p.failureProbability30d);
    const cost = evaluateScenario({
      title: `${p.failureMode ?? "Wartung"} ${p.code}`, kind: "maintenance", probability: pNoAction, horizonDays: Math.round((noActionUntil - now) / D),
      downtimeHoursIfEvent: p.job.eventDowntimeH, secondaryDamageCost: p.failureMode === "Lagerschaden" ? 1890 : 0,
      action: { maintenanceHours: dur, technicians: p.job.technicians, partsCost: parts.reduce((a, x) => a + x.qty * x.unitCost, 0) + parts.filter((x) => x.transfer).length * 150, plannedDowntimeHours: dur, inPlannedWindow: inWindow },
      residualProbability: riskAt, analysisConfidence: p.explanation.confidence.score,
    }, effectiveConfig(cfg, plant.id));

    items.push({
      assetId: p.assetId, code: p.code, plant: plant.name, plantId: plant.id, line: g.ancestorOfType(p.assetId, "line")?.name ?? "–",
      priority: p.priority, riskScore: p.riskScore, failureMode: p.failureMode ?? "Inspektion",
      recommendedStart: start ? new Date(start).toISOString() : null, recommendedEnd: start ? new Date(start + dur * H).toISOString() : null,
      slotType, deadline: new Date(deadline).toISOString(), parts, partsMissing, technicians: p.job.technicians, durationHours: dur,
      expectedDowntimeHours: inWindow ? 0 : dur, failureRiskAtSlotPct: round(riskAt * 100, 1), failureRiskIfPostponed7dPct: round(riskLater * 100, 1),
      cost, reasons, requiresApproval: true,
    });
  }
  return items;
}
