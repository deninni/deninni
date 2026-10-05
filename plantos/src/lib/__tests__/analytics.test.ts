import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateKeyPairSync, createSign } from "node:crypto";

before(() => {
  process.env.PLANTOS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "plantos-analytics-"));
});

async function brain(tenant = "demo") {
  const { loadGraph } = await import("../graph/store");
  const { listMemory } = await import("../memory/store");
  const { TENANTS } = await import("../tenant/tenants");
  return { g: await loadGraph(tenant), memory: await listMemory(tenant), tenant: TENANTS.find((t) => t.id === tenant)! };
}

// ── Statistik ──
test("Statistik: Regression, Welch, Cosine", async () => {
  const { linreg, welch, cosine, quantile } = await import("../analytics/stats");
  const r = linreg([0, 1, 2, 3, 4], [1, 3, 5, 7, 9]);
  assert.equal(r.slope, 2);
  assert.equal(r.r2, 1);
  assert.ok(welch([5, 6, 5, 6, 5, 6], [1, 2, 1, 2, 1, 2]).p < 0.001);
  assert.equal(welch([1], [2]).p, 1);
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
});

// ── Predictive ──
test("Predictive: AF-24 (Süd) P1 mit RUL und Bereich; Schwingungs-Trend belastbar", async () => {
  const { g, memory } = await brain();
  const { predictAsset } = await import("../predictive/engine");
  const now = Date.UTC(2026, 9, 5, 8);
  const p = predictAsset(g.node("m-sued-af24")!, g, memory, now);
  assert.equal(p.priority, "P1");
  assert.equal(p.failureMode, "Lagerschaden");
  assert.ok(p.rul && p.rul.days > 0 && p.rul.range[0] <= p.rul.days && p.rul.days <= p.rul.range[1]);
  assert.ok(p.window && Date.parse(p.window.to) > now);
  assert.ok(p.explanation.confidence.score > 0 && p.explanation.missingData.includes("Drehmoment"));
  assert.ok(p.explanation.reasoning.length >= 3 && p.explanation.alternatives.length >= 2);
  assert.deepEqual(p.materials, ["4711"]);
});

test("Predictive: ohne belastbaren Trend → ehrlicher Hinweis statt RUL", async () => {
  const { g, memory } = await brain();
  const { predictAsset, NO_RUL_TEXT } = await import("../predictive/engine");
  const p = predictAsset(g.node("m-vl3")!, g, memory, Date.UTC(2026, 9, 5, 8));
  assert.equal(p.rul, null);
  assert.equal(p.rulText, NO_RUL_TEXT);
  assert.equal(p.rulText, "Nicht genügend Daten für eine belastbare Restlebensdauerprognose.");
  const short = predictAsset(g.node("m-sued-af24")!, g, memory, Date.UTC(2026, 9, 5, 8), 5);
  assert.equal(short.rul, null, "5 Tage Historie reichen nicht");
  assert.ok(short.explanation.missingData.some((m) => m.includes("Historie")));
});

test("Predictive: Wartungshistorie aus Memory fließt in Laufzeit ein", async () => {
  const { g, memory } = await brain();
  const { predictAsset } = await import("../predictive/engine");
  const p = predictAsset(g.node("m-af12")!, g, memory);
  assert.ok(p.lastMaintenanceAt, "Lagerwechsel M-001 im Memory");
  assert.ok((p.runtimeHoursSinceMaintenance ?? 0) > 0);
});

// ── Cross-Plant ──
test("Cross-Plant: AF-24 ähnelt Posener Lagerschaden; abschaltbar je Tenant; nie über Tenants", async () => {
  const { g, memory, tenant } = await brain();
  const { findSimilarCases } = await import("../crossplant/similarity");
  const now = Date.UTC(2026, 9, 5, 8);
  const r = findSimilarCases(tenant, g, memory, g.node("m-sued-af24")!, now);
  assert.equal(r.scope, "tenant");
  assert.ok(r.cases[0].similarityPct >= 80, `Ähnlichkeit ${r.cases[0].similarityPct}`);
  assert.equal(r.cases[0].plant, "Werk Posen");
  assert.ok(r.cases[0].cause && r.cases[0].repair);
  const off = findSimilarCases({ ...tenant, crossPlantLearning: false }, g, memory, g.node("m-sued-af24")!, now);
  assert.equal(off.scope, "plant");
  assert.equal(off.cases.length, 0, "Werk Süd hat keinen eigenen Fehlerfall");
  const acme = await brain("acme");
  const foreign = findSimilarCases(acme.tenant, acme.g, memory /* Demo-Memory absichtlich übergeben */, acme.g.node("acme-ft1")!, now);
  assert.equal(foreign.cases.length, 0, "Fremde Tenant-Einträge werden ignoriert");
});

// ── Quality ──
test("Quality AI: erkennt Kombination Druck + Bandgeschwindigkeit, mit Confidence und Kosten", async () => {
  const { g } = await brain();
  const { analyzeQuality } = await import("../quality/analysis");
  const q = analyzeQuality(g.node("m-af12")!, 0.21, Date.UTC(2026, 9, 5, 8));
  const combo = q.findings.find((f) => f.kind === "combined");
  assert.ok(combo, JSON.stringify(q.findings.map((f) => f.text)));
  assert.ok(combo!.rules.some((r) => r.key === "pressureBar" && r.op === "<"));
  assert.ok(combo!.rules.some((r) => r.key === "speedMs" && r.op === ">"));
  assert.ok(combo!.confidence > 0 && combo!.impactPerDay.cost > 0 && combo!.recommendedRange.includes("keine automatische"));
  assert.match(q.note, /keine Prozessparameter/);
});

// ── Energie ──
test("Energie: kWh, Leerlauf, Peak, Soll aus Historie, Potenzial mit Annahme", async () => {
  const { g } = await brain();
  const { analyzeEnergy } = await import("../energy/analysis");
  const e = analyzeEnergy(g.node("m-vl3")!, 0.19, Date.UTC(2026, 9, 5, 8), 7);
  assert.ok(e.kwhPerDay > 500 && e.idleKwh > 0 && e.peak15minKw >= e.avgKw);
  assert.ok(e.sollKwhPerUnit! > 0 && e.kwhPerUnit! >= e.sollKwhPerUnit!);
  assert.ok(e.potentials.length >= 1 && e.potentials.every((p) => p.assumption.includes("Annahme")));
  assert.equal(e.daily.length, 7);
});

// ── Planer ──
test("Wartungsplaner: AF-24 – Lager fehlt (Bestand 0, 12 T. Lieferzeit) → ungeplanter Stopp + Begründung", async () => {
  const { g, memory } = await brain();
  const { predictAsset } = await import("../predictive/engine");
  const { planMaintenance } = await import("../maintenance/planner");
  const { DEMO_ROI_CONFIG } = await import("../roi/engine");
  const now = Date.UTC(2026, 9, 5, 8);
  const plan = planMaintenance(g, [predictAsset(g.node("m-sued-af24")!, g, memory, now)], DEMO_ROI_CONFIG, now);
  const i = plan[0];
  assert.equal(i.partsMissing, true);
  assert.equal(i.parts[0].material, "4711");
  assert.equal(i.slotType, "ungeplanter Stopp");
  assert.ok(i.reasons.some((r) => r.includes("Lieferzeit")));
  assert.ok(i.failureRiskIfPostponed7dPct >= i.failureRiskAtSlotPct);
  assert.equal(i.requiresApproval, true);
});

test("Wartungsplaner: Teile vorrätig → nächstes Wartungsfenster des Werks", async () => {
  const { g, memory } = await brain();
  const { predictAsset } = await import("../predictive/engine");
  const { planMaintenance, plannedWindows } = await import("../maintenance/planner");
  const { DEMO_ROI_CONFIG } = await import("../roi/engine");
  const now = Date.UTC(2026, 9, 5, 8);
  const p = predictAsset(g.node("m-atl-af41")!, g, memory, now);
  const plan = planMaintenance(g, [p], DEMO_ROI_CONFIG, now);
  assert.ok(plannedWindows(g, "pl-atl", now, 14).length >= 2);
  if (plan[0]) {
    assert.equal(plan[0].partsMissing, false);
    assert.equal(plan[0].slotType, "geplantes Wartungsfenster");
    assert.equal(plan[0].expectedDowntimeHours, 0);
  }
});

// ── Simulation ──
test("Simulation: höhere Geschwindigkeit → mehr Last/Kipprisiko; Kennzeichnung; Eingaben begrenzt", async () => {
  const { simulateLine, sanitizeInput, DEFAULT_INPUT } = await import("../simulation/line");
  const slow = simulateLine({ ...DEFAULT_INPUT, beltSpeedMs: 0.8 });
  const fast = simulateLine({ ...DEFAULT_INPUT, beltSpeedMs: 1.6, bottleFormat: "1.5" }, { beltSpeedMs: true });
  assert.ok(fast.outputs.tipRisk.value > slow.outputs.tipRisk.value);
  assert.ok(fast.outputs.energy.value > slow.outputs.energy.value);
  assert.equal(fast.inputs.beltSpeedMs.kind, "Messwert");
  assert.equal(fast.inputs.frictionCoeff.kind, "Annahme");
  assert.ok(Object.values(fast.outputs).every((o) => o.kind === "Simulation"));
  assert.match(fast.disclaimer, /keine Wirkung auf die Anlage/i);
  assert.equal(sanitizeInput({ beltSpeedMs: 999, bottleFormat: "<script>" }).beltSpeedMs, 3);
  assert.equal(sanitizeInput({ bottleFormat: "<script>" }).bottleFormat, "1.0");
  const jam = simulateLine({ ...DEFAULT_INPUT, fillerCycleS: 0.08, packerCycleS: 0.12, bufferCapacity: 100 });
  assert.ok(jam.outputs.jamTime.value > 0 && jam.warnings.some((w) => w.includes("Stau")));
});

// ── SAP ──
test("SAP: Demo-Adapter liest Bestand aus Plant Brain; OData-Adapter (gemockt) + Schreibsperre", async () => {
  const { g } = await brain();
  const { DemoSapAdapter, ODataSapAdapter } = await import("../sap/adapter");
  const demo = new DemoSapAdapter(g);
  assert.equal((await demo.materialStock("4711", "pl-sued"))?.stock, 0);
  assert.equal((await demo.materialStock("4711", "pl-sued"))?.source, "DEMO");
  const calls: string[] = [];
  const fake = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("A_MatlStkInAcctMod")) return new Response(JSON.stringify({ d: { results: [{ MatlWrhsStkQtyInMatlBaseUnit: "3" }, { MatlWrhsStkQtyInMatlBaseUnit: "2" }] } }), { status: 200 });
    if (init?.method === "POST") return new Response(JSON.stringify({ d: { MaintenanceNotification: "10004711" } }), { status: 201 });
    return new Response("", { status: 200, headers: { "x-csrf-token": "tok" } });
  };
  const ro = new ODataSapAdapter({ baseUrl: "https://sap.example", user: "u", password: "p", writeEnabled: false }, fake);
  assert.equal((await ro.materialStock("4711", "1000"))?.stock, 5);
  assert.equal((await ro.createNotification({ equipment: "EQ1", shortText: "x", longText: "y", priority: "2", notificationType: "M2" })).ok, false);
  await assert.rejects(ro.materialStock("47' or 1=1", "1000"), /Ungültige/);
  const rw = new ODataSapAdapter({ baseUrl: "https://sap.example", user: "u", password: "p", writeEnabled: true }, fake);
  const r = await rw.createNotification({ equipment: "EQ1", shortText: "Lager", longText: "y", priority: "1", notificationType: "M2" });
  assert.equal(r.externalId, "10004711");
  assert.ok(calls.some((c) => c.startsWith("POST") && c.includes("MaintenanceNotification")));
});

test("SAP-Aktionen: vorbereiten → Vier-Augen-Prinzip → ausführen; nichts gelöscht", async () => {
  const { prepareSapAction, decideSapAction, listSapActions } = await import("../sap/actions");
  const a = await prepareSapAction("demo", { assetId: "m-sued-af24", by: "inst@x", source: "test", draft: { equipment: "EQ", shortText: "t", longText: "l", priority: "1", notificationType: "M2" } });
  await assert.rejects(decideSapAction("demo", a.id, "inst@x", { reject: true }), /Vier-Augen/);
  const done = await decideSapAction("demo", a.id, "wl@x", { result: { ok: true, mode: "demo", message: "ok" } });
  assert.equal(done.status, "executed");
  await assert.rejects(decideSapAction("demo", a.id, "wl@x", { reject: true }), /bereits/);
  assert.ok((await listSapActions("demo")).some((x) => x.id === a.id));
  assert.equal((await listSapActions("acme")).length, 0, "Tenant-Isolation SAP-Aktionen");
});

// ── Discovery ──
test("Discovery: IO-CSV, EPLAN, TIA, OPC-UA-NodeSet; Excel/Binär abgelehnt; Schreib-Tags ungültig", async () => {
  const { parseDiscovery, parseBmk } = await import("../discovery/parsers");
  assert.deepEqual(parseBmk("=AF24+S1-M12"), { plant: "AF24", location: "S1", device: "M12" });
  const io = parseDiscovery("io-csv", "BMK;Adresse;Typ;Beschreibung\n=SUED+L2-M12;DB12.DBD4;REAL;Motorstrom Förderband\nSollwert_Speed;DB12.DBD8;REAL;nein\nB7;FOO;BOOL;x");
  assert.equal(io.candidates.length, 3);
  assert.equal(io.candidates[0].name, "M12");
  assert.equal(io.candidates[1].valid, false);
  assert.equal(io.candidates[2].valid, false);
  const ep = parseDiscovery("eplan-csv", "Betriebsmittelkennzeichen;Funktionstext;Artikelnummer\n=AF24+S1-M-241;Hauptantrieb;3RW\n=AF24+S1-B12;Temperatur Motor;PT100");
  assert.equal(ep.candidates.length, 2);
  const ua = parseDiscovery("opcua-nodeset", `<UANodeSet><UAVariable NodeId="ns=2;s=AF24.Motor.Temp" BrowseName="2:Temp" DataType="Double" AccessLevel="1"><DisplayName>Temperatur M-241</DisplayName></UAVariable></UANodeSet>`);
  assert.equal(ua.candidates[0].nodeId, "ns=2;s=AF24.Motor.Temp");
  assert.equal(parseDiscovery("io-csv", "PK\u0003\u0004xxxx").ok, false);
  assert.equal(parseDiscovery("opcua-nodeset", "<foo/>").ok, false);
});

test("Discovery: Zuordnung als Vorschlag mit Confidence; exakter BMK = sicher", async () => {
  const { g } = await brain();
  const { parseDiscovery } = await import("../discovery/parsers");
  const { matchCandidates } = await import("../discovery/match");
  const c = parseDiscovery("io-csv", "Tag;Adresse;Typ;Beschreibung\nM12;DB12.DBD40;REAL;Motorstrom\nXYZ99;DB12.DBD44;REAL;irgendwas").candidates;
  const s = matchCandidates(g, "m-sued-fb03", c);
  assert.equal(s[0].status, "sicher");
  assert.equal(s[0].assetId, "m-sued-fb03-motor");
  assert.equal(s[1].status, "unklar");
});

// ── OIDC ──
test("OIDC: PKCE, Auth-URL, ID-Token-Prüfung (Signatur, aud, nonce, exp), Rollen-Mapping", async () => {
  const o = await import("../auth/oidc");
  const { verifier, challenge } = await o.pkcePair();
  assert.ok(verifier.length >= 43 && challenge.length === 43);
  const cfg = { issuer: "https://login.example/t/v2.0", clientId: "app", redirectUri: "https://plantos/cb", scopes: "openid", tenantId: "demo", roleMap: { "grp-wl": "plant_manager" as const }, defaultRole: null };
  const disc = { issuer: cfg.issuer, authorization_endpoint: "https://login.example/auth", token_endpoint: "https://login.example/token", jwks_uri: "https://login.example/keys" };
  const url = new URL(o.authorizationUrl(disc, cfg, { state: "s", nonce: "n", challenge }));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: "k1" };
  const sign = (claims: object) => {
    const h = Buffer.from(JSON.stringify({ alg: "RS256", kid: "k1" })).toString("base64url");
    const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const s = createSign("RSA-SHA256").update(`${h}.${p}`).sign(privateKey).toString("base64url");
    return `${h}.${p}.${s}`;
  };
  const fetchJwks = async () => new Response(JSON.stringify({ keys: [jwk] }));
  const now = Date.now();
  const good = { iss: cfg.issuer, aud: "app", exp: Math.floor(now / 1000) + 600, nonce: "n", sub: "u1", email: "wl@kunde.com", groups: ["grp-wl"] };
  const c = await o.verifyIdToken(sign(good), cfg, disc, "n", fetchJwks, now);
  assert.equal(o.mapRole(c, cfg), "plant_manager");
  await assert.rejects(o.verifyIdToken(sign({ ...good, aud: "evil" }), cfg, disc, "n", fetchJwks, now), /Zielgruppe/);
  await assert.rejects(o.verifyIdToken(sign(good), cfg, disc, "falsch", fetchJwks, now), /Nonce/);
  await assert.rejects(o.verifyIdToken(sign({ ...good, exp: 1 }), cfg, disc, "n", fetchJwks, now), /abgelaufen/);
  const tampered = sign(good).split(".");
  tampered[1] = Buffer.from(JSON.stringify({ ...good, groups: ["admins"] })).toString("base64url");
  await assert.rejects(o.verifyIdToken(tampered.join("."), cfg, disc, "n", fetchJwks, now), /Signatur/);
  assert.equal(o.mapRole({ ...good, groups: [] }, cfg), null, "ohne Gruppe kein Zugang");
});

// ── Rechte / Audit / Secrets ──
test("Rechte-Matrix: 5 Rollen, kritische Rechte nur für berechtigte Rollen", async () => {
  const { can } = await import("../auth/roles");
  assert.ok(!can("viewer", "ticket.create") && can("operator", "ticket.create"));
  assert.ok(!can("operator", "memory.write") && can("maintenance", "memory.write"));
  assert.ok(!can("maintenance", "maintenance.approve") && can("plant_manager", "maintenance.approve"));
  assert.ok(!can("maintenance", "sap.execute") && can("plant_manager", "sap.execute"));
  assert.ok(!can("plant_manager", "tenant.config") && can("admin", "tenant.config"));
  assert.ok(can("viewer", "simulation.run"), "Simulation ist lesend erlaubt");
});

test("Audit: Hash-Kette erkennt Manipulation", async () => {
  const { audit, verifyAudit, readAudit, __resetAuditHeads } = await import("../audit");
  const { tenantDir, __resetTenantCache } = await import("../tenant/store");
  for (let i = 0; i < 5; i++) await audit({ tenant: "acme", actor: "t", action: `a${i}` });
  assert.deepEqual(await verifyAudit("acme"), { ok: true, entries: 5 });
  assert.equal((await readAudit(10, "acme"))[0].action, "a4");
  assert.equal((await readAudit(10, "demo")).filter((e) => e.actor === "t").length, 0, "Tenant-Isolation Audit");
  const f = path.join(tenantDir("acme"), "audit.jsonl");
  writeFileSync(f, readFileSync(f, "utf8").replace('"action":"a2"', '"action":"gelöscht"'));
  __resetTenantCache(); __resetAuditHeads();
  const v = await verifyAudit("acme");
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 3);
});

test("Secrets: Status ohne Werte, *_FILE-Unterstützung", async () => {
  const { secretStatus, getSecret } = await import("../config/secrets");
  const f = path.join(process.env.PLANTOS_DATA_DIR!, "edge.secret");
  writeFileSync(f, "x".repeat(30) + "\n");
  process.env.PLANTOS_EDGE_TOKEN_FILE = f;
  assert.equal(getSecret("PLANTOS_EDGE_TOKEN"), "x".repeat(30));
  const st = secretStatus().find((s) => s.name === "PLANTOS_EDGE_TOKEN")!;
  assert.deepEqual([st.configured, st.strong, st.viaFile], [true, true, true]);
  assert.ok(!JSON.stringify(secretStatus()).includes("xxxxxxxx"));
  delete process.env.PLANTOS_EDGE_TOKEN_FILE;
});

// ── Ledger / Reports / Rollup / Copilot ──
test("Value-Ledger: nur verifizierte Ergebnisse; DEMO getrennt; Scope-Filter", async () => {
  const { g, memory } = await brain();
  const { valueItems, summarizeValue } = await import("../roi/ledger");
  const items = valueItems(g, memory);
  assert.ok(items.length >= 2 && items.every((i) => i.demo));
  const s = summarizeValue(items, null);
  assert.equal(s.periods.year.realized, 0, "keine realen Einsparungen ohne reale Daten");
  assert.ok(s.periods.year.realizedDemo > 0);
  const nord = summarizeValue(items, new Set(["pl-nord", ...g.descendants("pl-nord").map((n) => n.id)]));
  assert.ok(nord.items.every((i) => i.plantId === "pl-nord"));
});

test("Multi-Site-Rollup und Reports (alle 8 Typen, PDF gültig)", async () => {
  const b = await brain();
  const { predictAsset } = await import("../predictive/engine");
  const { machineMetrics, rollup } = await import("../enterprise/rollup");
  const { valueItems } = await import("../roi/ledger");
  const { buildReport, reportPdf, REPORT_TYPES } = await import("../reports/build");
  const { DEMO_ROI_CONFIG } = await import("../roi/engine");
  const now = Date.UTC(2026, 9, 5, 8);
  const preds = b.g.machinesUnder("co").map((m) => predictAsset(m, b.g, b.memory, now));
  const values = valueItems(b.g, b.memory);
  const metrics = new Map(b.g.machinesUnder("co").map((m) => [m.id, machineMetrics(m, b.g, preds.find((p) => p.assetId === m.id), values, now)]));
  const r = rollup(b.g, "co", metrics, 2)!;
  assert.equal(r.machines, 10);
  assert.equal(r.children.length, 2);
  assert.ok(r.critical.some((c) => c.code === "AF-24"));
  assert.ok(r.sparePartsBelowMin > 0);
  for (const t of Object.keys(REPORT_TYPES) as (keyof typeof REPORT_TYPES)[]) {
    const rep = buildReport(t, { tenant: b.tenant, g: b.g, memory: b.memory }, { scopeId: "pl-sued", preds, metrics, cfg: DEMO_ROI_CONFIG, tickets: [], user: "Test", now });
    assert.ok(rep.sections.length >= 1, t);
    assert.match(rep.dataNote, /DEMO/);
    const pdf = Buffer.from(reportPdf(rep)).toString("latin1");
    assert.ok(pdf.startsWith("%PDF-1.4") && pdf.trimEnd().endsWith("%%EOF"), t);
  }
});

test("Copilot (erweitert): Antworten aus Plant Brain/Predictive/Planer/Energie, mit Quellen", async () => {
  const b = await brain();
  const { predictAsset } = await import("../predictive/engine");
  const { machineMetrics } = await import("../enterprise/rollup");
  const { planMaintenance } = await import("../maintenance/planner");
  const { analyzeEnergy } = await import("../energy/analysis");
  const { findSimilarCases } = await import("../crossplant/similarity");
  const { DEMO_ROI_CONFIG } = await import("../roi/engine");
  const { answerEnterprise, findAsset } = await import("../copilot/enterprise");
  const now = Date.UTC(2026, 9, 5, 8);
  const preds = b.g.machinesUnder("co").map((m) => predictAsset(m, b.g, b.memory, now));
  const metrics = new Map(b.g.machinesUnder("co").map((m) => [m.id, machineMetrics(m, b.g, preds.find((p) => p.assetId === m.id), [], now)]));
  const ctx = {
    brain: b, preds, metrics, cfg: DEMO_ROI_CONFIG, tickets: [], alerts: [], scopeId: "co", now,
    plan: () => planMaintenance(b.g, preds, DEMO_ROI_CONFIG, now),
    energy: () => b.g.machinesUnder("co").map((m) => ({ ...analyzeEnergy(m, 0.19, now, 3), assetId: m.id })),
    similar: (m: Parameters<typeof findSimilarCases>[3]) => findSimilarCases(b.tenant, b.g, b.memory, m, now).cases,
  };
  assert.equal(findAsset("Was ist mit fb03?", b)?.code, "FB03");
  const crit = answerEnterprise("Welche Maschinen sind aktuell kritisch?", ctx)!;
  assert.match(crit.text, /AF-24/);
  assert.ok(crit.sources.includes("Predictive Engine"));
  assert.match(answerEnterprise("Welche Ersatzteile fehlen?", ctx)!.text, /4711/);
  assert.match(answerEnterprise("Welche Linie verursacht die meisten Kosten?", ctx)!.text, /1\. /);
  assert.match(answerEnterprise("Welche Wartung sollte diese Woche geplant werden?", ctx)!.text, /AF-24/);
  assert.match(answerEnterprise("Wo gibt es Energiepotenzial?", ctx)!.text, /Schätzung/);
  assert.match(answerEnterprise("Welche Maschine ähnelt einem früheren Ausfall?", ctx)!.text, /Werk Posen/);
  assert.match(answerEnterprise("Warum steht AF-24?", ctx)!.text, /AF-24 \(Werk Süd\)/);
  assert.match(answerEnterprise("Welche Fehler wiederholen sich?", ctx)!.text, /Memory/);
  assert.equal(answerEnterprise("Erzähl mir was", ctx), null);
});
