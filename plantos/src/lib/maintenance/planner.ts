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
export interface PartNeed { sparePartId: string; material: string; name: string; qty: number; stock: number; leadTimeDays: number; available: boolean; readyAt: string; unitCost: number }

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
      return { sparePartId: sp.id, material: pr.sapMaterial, name: sp.name, qty, stock: pr.stock, leadTimeDays: pr.leadTimeDays, available, readyAt: new Date(available ? now : now + pr.leadTimeDays * D).toISOString(), unitCost: pr.unitCost };
    });
    const partsReady = Math.max(now, ...parts.map((x) => Date.parse(x.readyAt)));
    const partsMissing = parts.some((x) => !x.available);
    if (partsMissing) reasons.push(`Ersatzteil fehlt: ${parts.filter((x) => !x.available).map((x) => `${x.name} (SAP ${x.material}, Lieferzeit ${x.leadTimeDays} T.)`).join(", ")}`);

    const deadline = p.window ? Date.parse(p.window.to) : now + 30 * D;
    const dur = p.job.hours;
    const slot = windows.find((w) => w.start >= partsReady && w.end - w.start >= dur * H && w.techniciansFree >= p.job.technicians);

    let start: number | null = null, slotType: PlanItem["slotType"], inWindow = false;
    if (slot && slot.start <= deadline) {
      start = slot.start; slotType = "geplantes Wartungsfenster"; inWindow = true;
      slot.techniciansFree -= p.job.technicians;
      reasons.push("Termin im nächsten passenden Wartungsfenster vor Prognosegrenze");
    } else if (partsReady > deadline) {
      start = partsReady; slotType = "ungeplanter Stopp";
      reasons.push("Lieferzeit überschreitet Prognosefenster – Eilbeschaffung prüfen, Zwischeninspektion empfohlen");
    } else if (slot) {
      start = Math.max(partsReady, deadline - D); slotType = "ungeplanter Stopp";
      reasons.push("Kein Wartungsfenster vor Prognosegrenze – kurzer geplanter Stopp nötig");
    } else {
      slotType = "kein Termin im Horizont";
      reasons.push(`Kein Fenster mit ${p.job.technicians} Technikern in ${horizonDays} Tagen`);
    }

    const at = start ?? deadline;
    const riskAt = failProb(p, at, now);
    const riskLater = failProb(p, at + 7 * D, now);
    const cost = evaluateScenario({
      title: `${p.failureMode ?? "Wartung"} ${p.code}`, kind: "maintenance", probability: Math.max(riskLater, p.failureProbability30d), horizonDays: Math.round((at + 7 * D - now) / D),
      downtimeHoursIfEvent: p.job.eventDowntimeH, secondaryDamageCost: p.failureMode === "Lagerschaden" ? 1890 : 0,
      action: { maintenanceHours: dur, technicians: p.job.technicians, partsCost: parts.reduce((a, x) => a + x.qty * x.unitCost, 0), plannedDowntimeHours: dur, inPlannedWindow: inWindow },
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
