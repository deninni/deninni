import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

before(() => {
  process.env.PLANTOS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "plantos-brain-"));
});

test("Plant Brain: Beispielkette M12 → FB03 → Linie 2, PLC01, DB12.DBD4, Material 4711", async () => {
  const { loadGraph } = await import("../graph/store");
  const g = await loadGraph("demo");
  const m12 = g.search("M12", { types: ["component"] })[0];
  assert.ok(m12, "Motor M12 vorhanden");
  assert.equal(g.parent(m12.id)?.name, "Antriebsstation");
  assert.equal(g.ancestorOfType(m12.id, "machine")?.code, "FB03");
  assert.equal(g.ancestorOfType(m12.id, "line")?.name, "Linie 2");
  assert.equal(g.ancestorOfType(m12.id, "plant")?.name, "Werk Süd");
  assert.equal(g.related(m12.id, "controlledBy", "out")[0].node.code, "PLC01");
  assert.equal(g.related(m12.id, "measuredBy", "out")[0].node.code, "DB12.DBD4");
  const parts = g.sparePartsOf("m-sued-fb03");
  assert.ok(parts.some((p) => p.code === "4711"));
  const sp = parts.find((p) => p.code === "4711")!;
  assert.equal(g.related(sp.id, "material", "out")[0].node.id, "mat-4711");
  assert.equal(g.pathOf(m12.id), "SUED › ABF › L2 › FB03 › Antriebsstation › M12");
});

test("Plant Brain: Hierarchie Konzern → Region → Land → Standort → Werk → Linie → Maschine", async () => {
  const { loadGraph } = await import("../graph/store");
  const g = await loadGraph("demo");
  assert.equal(g.machinesUnder("co").length, 10);
  assert.equal(g.machinesUnder("pl-nord").length, 3);
  assert.equal(g.machinesUnder("cty-us").length, 2);
  const af12 = g.node("m-af12")!;
  assert.deepEqual(g.ancestors(af12.id).map((a) => a.type), ["line", "area", "plant", "site", "country", "region", "company"]);
  // Bestandsanlage: Twin-Komponenten übernommen, Hauptmotor nicht doppelt
  assert.ok(g.node("m-af12/sr-03"));
  assert.equal(g.node("m-af12/m-001"), undefined);
  assert.equal(g.node("m-af12-motor")?.props.twinNode, "m-001");
});

test("Plant Brain: Suche + Filter nach Typ und Scope", async () => {
  const { loadGraph } = await import("../graph/store");
  const g = await loadGraph("demo");
  assert.ok(g.search("lager", { types: ["sparePart"] }).length >= 4);
  const sued = g.search("motor", { scopeId: "pl-sued", types: ["component"] });
  assert.ok(sued.length >= 3 && sued.every((n) => g.ancestorOfType(n.id, "plant")?.id === "pl-sued"));
});

test("Plant Brain: Knoten/Kanten werden persistiert und validiert", async () => {
  const store = await import("../graph/store");
  const { __resetTenantCache } = await import("../tenant/store");
  const n = await store.addNode("demo", { type: "document", name: "Prüfprotokoll FB03", source: "user" });
  await store.addEdge("demo", { from: n.id, to: "m-sued-fb03", type: "documents", source: "user" });
  await assert.rejects(store.addEdge("demo", { from: n.id, to: "gibt-es-nicht", type: "documents", source: "user" }), /unbekannt/);
  await assert.rejects(store.addEdge("demo", { from: "m-sued-fb03", to: "pl-nord", type: "partOf", source: "user" }), /bereits/);
  __resetTenantCache();
  const g = await store.loadGraph("demo");
  assert.equal(g.related("m-sued-fb03", "documents", "in").filter((r) => r.node.id === n.id).length, 1);
});

test("Tenant-Isolation: Graph eines Tenants kennt Knoten des anderen nicht", async () => {
  const store = await import("../graph/store");
  const acme = await store.loadGraph("acme");
  assert.equal(acme.node("m-af12"), undefined);
  assert.equal(acme.machinesUnder("acme-co").length, 1);
  await assert.rejects(store.addEdge("acme", { from: "acme-ft1", to: "m-af12", type: "documents", source: "user" }), /unbekannt/);
  await assert.rejects(store.loadGraph("../demo"), /Ungültige Tenant-ID/);
});

test("Alarm/Ticket werden im Graphen verknüpft", async () => {
  const store = await import("../graph/store");
  await store.linkAlarmTicket("demo", { assetId: "m-af12", alarmId: "al-x", alarmTitle: "Test", ticketId: "t-x", ticketTitle: "Ticket" });
  const g = await store.loadGraph("demo");
  assert.equal(g.related("alarm:al-x", "affects", "out")[0].node.id, "m-af12");
  assert.equal(g.related("ticket:t-x", "createdFrom", "out")[0].node.id, "alarm:al-x");
});

test("Industrial Memory: Demo-Historie, Pflichtfelder, append-only, Confidence bei AI", async () => {
  const mem = await import("../memory/store");
  const all = await mem.listMemory("demo");
  assert.ok(all.length >= 20);
  assert.ok(all.every((e) => e.assetId && e.at && e.source && e.actor && e.description && e.demo));
  const fault = all.find((e) => e.type === "fault" && e.assetId === "m-poz-af31-motor")!;
  assert.equal((fault.meta.signature as number[]).length, 7);
  assert.ok(all.filter((e) => e.type === "aiRecommendation").every((e) => typeof e.confidence === "number"));

  await assert.rejects(mem.addMemory("demo", { assetId: "m-af12", type: "aiRecommendation", description: "ohne confidence", source: "ai", actor: "x" }), /Confidence/);
  await assert.rejects(mem.addMemory("demo", { assetId: "nope", type: "repair", description: "abc", source: "user", actor: "x" }), /Asset/);
  await assert.rejects(mem.addMemory("demo", { assetId: "m-af12", type: "photo", description: "Foto", source: "user", actor: "x", photoDataUrl: "data:text/html;base64,AAAA" }), /Foto/);

  const e = await mem.addMemory("demo", { assetId: "m-af12-motor", type: "repair", description: "Kupplung getauscht", source: "user", actor: "inst@x", meta: { durationHours: 1 } });
  const corr = await mem.addMemory("demo", { assetId: "m-af12-motor", type: "repair", description: "Korrektur: Kupplung + Passfeder", source: "user", actor: "inst@x", supersedes: e.id });
  const after = await mem.listMemory("demo", { assetIds: ["m-af12-motor"] });
  assert.ok(after.some((x) => x.id === e.id) && after.some((x) => x.id === corr.id), "Original bleibt erhalten");

  const png = "data:image/png;base64," + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64");
  const ph = await mem.addMemory("demo", { assetId: "m-af12-motor", type: "photo", description: "Lagerbefund", source: "user", actor: "x", photoDataUrl: png });
  assert.ok(ph.media && (await mem.readMedia("demo", ph.media.file))?.length === 8);
  assert.equal(await mem.readMedia("demo", "../../etc/passwd"), null);
});

test("Tenant-Isolation: Memory von acme enthält keine Demo-Einträge und lehnt fremde Assets ab", async () => {
  const mem = await import("../memory/store");
  assert.equal((await mem.listMemory("acme")).length, 0);
  await assert.rejects(mem.addMemory("acme", { assetId: "m-af12", type: "repair", description: "fremd", source: "user", actor: "x" }), /Asset/);
});

test("ROI-Engine: Kosten, Nutzen, ROI, Demo-Kennzeichnung, Validierung", async () => {
  const { evaluateScenario, DEMO_ROI_CONFIG, validateConfigPatch, effectiveConfig } = await import("../roi/engine");
  const r = evaluateScenario({ title: "t", kind: "predictive", probability: 0.5, horizonDays: 30, downtimeHoursIfEvent: 4, action: { maintenanceHours: 2, technicians: 2, partsCost: 100, plannedDowntimeHours: 2, inPlannedWindow: true }, analysisConfidence: 1 }, DEMO_ROI_CONFIG);
  // ohne Maßnahme: 0,5 · 4 h · 12.500 = 25.000
  assert.equal(r.costIfNoAction, 25000);
  // Maßnahme: 2·2·(85+62)=588 + 100 Teile + Restrisiko 5 % · 50.000 = 2.500 → 3.188
  assert.equal(r.costOfAction, 3188);
  assert.equal(r.netBenefit, 25000 - 3188);
  assert.equal(r.avoidedCost, 22500);
  assert.equal(r.roiPct, Math.round((21812 / 3188) * 100));
  assert.equal(r.demo, true);
  assert.equal(r.confidence, 0.7, "DEMO-Annahmen senken die Confidence");
  assert.ok(r.assumptions.some((a) => a.origin === "DEMO-Annahme"));
  const outside = evaluateScenario({ title: "t", kind: "predictive", probability: 0.5, horizonDays: 30, downtimeHoursIfEvent: 4, action: { maintenanceHours: 2, technicians: 2, partsCost: 100, plannedDowntimeHours: 2, inPlannedWindow: false }, analysisConfidence: 1 }, DEMO_ROI_CONFIG);
  assert.equal(outside.costOfAction - r.costOfAction, 25000, "Stillstand außerhalb des Fensters kostet");
  const zero = evaluateScenario({ title: "t", kind: "energy", probability: 0, horizonDays: 1, downtimeHoursIfEvent: 0, action: { maintenanceHours: 0, technicians: 0, partsCost: 0, plannedDowntimeHours: 0, inPlannedWindow: true }, analysisConfidence: 0.5 }, DEMO_ROI_CONFIG);
  assert.equal(zero.roiPct, null, "kein ROI bei Kosten 0");
  assert.equal(validateConfigPatch({ energyPricePerKwh: -1 }).ok, false);
  assert.equal(validateConfigPatch({ hacker: 1 }).ok, false);
  assert.equal(effectiveConfig(DEMO_ROI_CONFIG, "pl-atl").energyPricePerKwh, 0.11);
});
