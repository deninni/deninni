import type { GraphIndex } from "../graph/queries";
import type { MemoryEntry, MemoryType } from "./model";
import { lastDriftReset } from "../demo/engine";
import { signatureAt } from "../analytics/signature";
import { evaluateScenario, DEMO_ROI_CONFIG, effectiveConfig } from "../roi/engine";
import { machineProps } from "../assets/telemetry";

/**
 * Demo-Historie (DEMO – nicht real). Zeitpunkte sind aus dem Verschleißmodell der Demo-Engine
 * abgeleitet, damit Historie, Trends und Cross-Plant-Vergleiche zusammenpassen.
 */
const H = 3_600_000, D = 86_400_000;

export function buildDemoMemory(tenant: string, g: GraphIndex, now = Date.now()): MemoryEntry[] {
  if (tenant !== "demo") return [];
  const out: MemoryEntry[] = [];
  let n = 0;
  const add = (assetId: string, type: MemoryType, at: number, description: string, extra: Partial<MemoryEntry> = {}) => {
    if (!g.node(assetId)) return "";
    const id = `mem-demo-${String(++n).padStart(3, "0")}`;
    out.push({ id, tenant, assetId, at: new Date(at).toISOString(), recordedAt: new Date(at + 30 * 60_000).toISOString(), type, source: "demo-seed", actor: "DEMO", description, meta: {}, links: {}, demo: true, ...extra });
    return id;
  };

  // ── Werk Posen AF-31: Lagerschaden am Ende des letzten Verschleißzyklus (Referenzfall) ──
  const af31 = g.node("m-poz-af31");
  if (af31) {
    const reset = lastDriftReset("m-af12", now, machineProps(af31).driftPhaseDays ?? 0);
    const failAt = reset - 2 * H;
    const sig = signatureAt(af31, failAt - 6 * H);
    const fault = add("m-poz-af31-motor", "fault", failAt, "Ausfall Hauptantrieb M-311: Lagerschaden Antriebsseite, Linie stand 6,5 h.", { meta: { failureMode: "Lagerschaden", downtimeHours: 6.5, signature: sig, signatureAt: new Date(failAt - 6 * H).toISOString(), component: "bearing" }, links: { alarmId: "POZ-VIB-311", ticketId: "POZ-T-1188" } });
    add("m-poz-af31-motor", "alarmHistory", failAt - 26 * H, "Schwingung VS-M-311 über 6,0 mm/s (mehrfach in 24 h), quittiert ohne Maßnahme.", { meta: { alarmCode: "VIB-HI", count: 7 }, links: { alarmId: "POZ-VIB-311" } });
    add("m-poz-af31-bearing", "cause", failAt + 3 * H, "Ursache: Schmierfettverlust am Lager AS (Dichtung beschädigt), Verschleiß über ca. 4 Monate.", { meta: { rootCause: "Schmierung", method: "Befund Instandhaltung" }, links: { relatedEntryId: fault } });
    add("m-poz-af31-bearing", "partReplacement", failAt + 5 * H, "Rillenkugellager 6205-2RS getauscht (2 Stück), SAP-Material 4711.", { meta: { sapMaterial: "4711", quantity: 2, partsCost: 76 }, links: { sapRef: "MAT-4711", relatedEntryId: fault } });
    add("m-poz-af31-motor", "repair", failAt + 6 * H, "Motor M-311 neu ausgerichtet, Probelauf 30 min, Schwingung 2,0 mm/s.", { meta: { durationHours: 4.5, technicians: 2 }, links: { relatedEntryId: fault, ticketId: "POZ-T-1188" } });
    add("m-poz-af31-motor", "technicianComment", failAt + 7 * H, "Schwingungsanstieg war ~3 Wochen vorher im Trend sichtbar. Nachschmierintervall auf 1.000 h verkürzt.", { actor: "Instandhaltung Posen (DEMO)" });
    add("m-poz-af31-motor", "outcome", failAt + 3 * D, "Nach Lagertausch: Schwingung stabil 2,0–2,3 mm/s über 72 h.", { meta: { verified: true, kind: "repair-result", avoidedCostEur: 0 } });
  }

  // ── Werk Nord AF-12: letzte Instandsetzung = Beginn des aktuellen Verschleißzyklus ──
  const resetNord = lastDriftReset("m-af12", now, 0);
  add("m-af12-motor", "maintenance", resetNord, "Planmäßiger Lagerwechsel M-001 (Wartungsfenster Samstag).", { meta: { durationHours: 5, technicians: 2, interval: "2.500 h" }, links: { sapRef: "WO-DEMO-40211" } });
  add("m-af12-bearing", "partReplacement", resetNord + H, "Rillenkugellager 6205-2RS getauscht, SAP-Material 4711.", { meta: { sapMaterial: "4711", quantity: 2, partsCost: 76 } });
  add("m-af12", "productionParameter", now - 9 * D, "Fülldruck-Sollwert an der HMI von 5,0 auf 5,2 bar geändert (Bediener, Formatwechsel 1,5 L).", { meta: { parameter: "Fülldruck", from: 5.0, to: 5.2, unit: "bar", changedVia: "HMI (nicht durch plantOS)" } });
  add("m-af12-plc", "plcChange", now - 21 * D, "SPS-Programm PLC-NA1: FB12 v1.3 (Sternrad-Synchronisation) durch Elektrik eingespielt.", { meta: { block: "FB12", version: "1.3", by: "Elektrik (nicht durch plantOS)" } });
  add("m-af12/sr-03", "disturbance", now - 4 * D, "Wiederkehrendes Kippen an SR-03 bei Format 1,5 L.", { meta: { occurrences: 6 } });
  add("m-af12/sr-03", "technicianComment", now - 4 * D + 2 * H, "Führungsgeländer SR-03 für 1,5 L nachgestellt. Beobachten.", { actor: "Schicht Nord (DEMO)" });

  // ── Werk Nord FT-7: Stromspitzen A3, Maßnahme mit verifiziertem Ergebnis ──
  const ftScenario = evaluateScenario({ title: "Getriebeöl A3 / Kupplung", kind: "predictive", probability: 0.35, horizonDays: 30, downtimeHoursIfEvent: 5, secondaryDamageCost: 1240, action: { maintenanceHours: 2, technicians: 1, partsCost: 60, plannedDowntimeHours: 2, inPlannedWindow: true }, analysisConfidence: 0.7 }, effectiveConfig(DEMO_ROI_CONFIG, "pl-nord"));
  const ftRec = add("m-ft7-motor", "aiRecommendation", now - 20 * D, "Wiederkehrende Stromspitzen Antrieb A3: Getriebeöl und Kupplung prüfen.", { source: "ai", confidence: 0.7, meta: { model: "Regelbaum + Trend", roi: ftScenario } });
  const ftApp = add("m-ft7-motor", "humanApproval", now - 19 * D, "Maßnahme freigegeben für Wartungsfenster Samstag.", { actor: "Werkleitung Nord (DEMO)", meta: { approves: ftRec, expectedNetBenefitEur: ftScenario.netBenefit }, links: { relatedEntryId: ftRec } });
  add("m-ft7-motor", "maintenance", now - 17 * D, "Getriebeöl A3 gewechselt, Kupplung nachgestellt.", { meta: { durationHours: 2, technicians: 1 }, links: { relatedEntryId: ftApp } });
  add("m-ft7-motor", "outcome", now - 10 * D, "Stromspitzen A3 seit Maßnahme um ca. 40 % seltener (7 Tage Beobachtung).", { meta: { verified: true, verifiedBy: "Werkleitung Nord (DEMO)", avoidedCostEur: ftScenario.avoidedCost, netBenefitEur: ftScenario.netBenefit, method: "ROI-Engine mit DEMO-Annahmen" }, links: { relatedEntryId: ftRec } });

  // ── Werk Atlanta AF-41: frühzeitige Lagerinspektion ──
  const af41 = g.node("m-atl-af41");
  const resetAtl = af41 ? lastDriftReset("m-af12", now, machineProps(af41).driftPhaseDays ?? 0) : now - 44 * D;
  const atlScenario = evaluateScenario({ title: "Lagerwechsel M-411 vor Ausfall", kind: "predictive", probability: 0.6, horizonDays: 21, downtimeHoursIfEvent: 6.5, secondaryDamageCost: 1890, action: { maintenanceHours: 4, technicians: 2, partsCost: 76, plannedDowntimeHours: 4, inPlannedWindow: true }, analysisConfidence: 0.8 }, effectiveConfig(DEMO_ROI_CONFIG, "pl-atl"));
  const atlRec = add("m-atl-af41-motor", "aiRecommendation", resetAtl - 4 * D, "Schwingungstrend M-411 steigend: Lagerwechsel im nächsten Wartungsfenster.", { source: "ai", confidence: 0.8, meta: { roi: atlScenario } });
  add("m-atl-af41-motor", "humanApproval", resetAtl - 3 * D, "Freigegeben.", { actor: "Plant Manager Atlanta (DEMO)", meta: { approves: atlRec, expectedNetBenefitEur: atlScenario.netBenefit }, links: { relatedEntryId: atlRec } });
  add("m-atl-af41-bearing", "partReplacement", resetAtl, "Lager 6205-2RS getauscht im Wartungsfenster.", { meta: { sapMaterial: "4711", quantity: 2, partsCost: 76 } });
  add("m-atl-af41-motor", "outcome", resetAtl + 4 * D, "Lager zeigte deutlichen Laufbahnverschleiß – Ausfall vermieden (Befund dokumentiert).", { meta: { verified: true, verifiedBy: "Plant Manager Atlanta (DEMO)", avoidedCostEur: atlScenario.avoidedCost, netBenefitEur: atlScenario.netBenefit, method: "ROI-Engine mit DEMO-Annahmen" }, links: { relatedEntryId: atlRec } });

  // ── Werk Süd ──
  add("m-sued-fb03-motor", "technicianComment", now - 6 * D, "M12 läuft hörbar rauer als FB02. Lager 4711 nicht am Lager – Bestellung anstoßen?", { actor: "Instandhaltung Süd (DEMO)" });
  add("m-sued-fb03-gurt", "disturbance", now - 12 * D, "Gurt FB03 läuft seitlich an, nachgestellt.", { meta: { durationMin: 25 } });
  add("m-sued-af24-motor", "alarmHistory", now - 2 * D, "Schwingung VS-M-241 mehrfach über 6,0 mm/s.", { meta: { alarmCode: "VIB-HI", count: 4 } });

  return out;
}
