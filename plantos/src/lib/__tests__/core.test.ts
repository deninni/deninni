import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { sampleMachine, kpis, series, activeIncidentAt, INCIDENTS } from "../demo/engine";
import { signSession, verifySession } from "../auth/session";
import { hasRole } from "../auth/roles";
import { rateLimit } from "../auth/rate-limit";
import { guardTelemetry, checkTagName } from "../plc/tag-write-guard";
import { enforceS7EdgeHonesty, freshness, isS7Address } from "../plc/edge-protocol";
import { assessConnector, tt214ExampleInput } from "../diagnostics/connector-suspicion";
import { dedupeKey, consolidate } from "../tickets/dedupe";
import { applyNewTicket } from "../tickets/create";
import { computePhysics, maxSafeSpeed } from "../twin/physics";
import { shortComponentLabel } from "../twin/layouts";
import { buildTwin } from "../twin/health";
import { classifyPlantScope, wantsTicketFromRca, CONTROL_REFUSAL, PLANT_SCOPE_REFUSAL } from "../copilot/scope";
import { answerLocal } from "../copilot/answer";
import { runRca } from "../rca/rules";
import { deriveAlerts } from "../alerts";
import { buildHandover, handoverPdf, handoverFilename, handoverPlainText } from "../handover/build";
import { pdfEscape } from "../handover/pdf";
import { parseSymbolList } from "../plc/symbol-list";
import { detectAnomalies } from "../history/anomaly";
import type { Ticket } from "../store/store";

const T0 = Date.UTC(2026, 9, 5, 8, 0, 0);

// ── Demo-Engine ─────────────────────────────────────────────
test("engine ist deterministisch und liefert DEMO", () => {
  const a = sampleMachine("m-af12", T0);
  const b = sampleMachine("m-af12", T0);
  assert.deepEqual(a, b);
  assert.equal(a.source, "DEMO");
  assert.ok(a.signals.speedPercent >= 0 && a.signals.speedPercent <= 100);
});

test("engine: Vorfälle erzeugen WARN/FAULT-Zustände", () => {
  const pts = series("m-ft7", T0 - 6 * 3600_000, T0, 60_000);
  assert.ok(pts.some((p) => p.state === "FAULT"), "FT-7 sollte im 6-h-Fenster eine Störung haben");
  assert.ok(pts.some((p) => p.state === "RUNNING"));
});

test("engine: OEE plausibel (40–100 %)", () => {
  for (const id of ["m-af12", "m-vl3", "m-ft7"] as const) {
    const k = kpis(id, T0);
    assert.ok(k.oeePct > 40 && k.oeePct <= 100, `${id} OEE ${k.oeePct}`);
    assert.ok(k.availabilityPct <= 100 && k.qualityPct <= 100);
  }
});

test("engine: activeIncidentAt erkennt Fenster", () => {
  const inc = INCIDENTS["m-af12"][0];
  const ts = (inc.offsetMin + 1) * 60_000 + inc.periodMin * 60_000 * 1000;
  assert.equal(activeIncidentAt("m-af12", ts)?.code, inc.code);
});

// ── Auth ────────────────────────────────────────────────────
test("session: signiert, verifiziert, manipuliert → null, abgelaufen → null", async () => {
  const tok = await signSession({ sub: "demo@plantos.local", name: "Demo", role: "admin" }, T0);
  const s = await verifySession(tok, T0 + 1000);
  assert.equal(s?.role, "admin");
  const [body, sig] = tok.split(".");
  const forged = Buffer.from(JSON.stringify({ ...s, role: "admin", sub: "evil" })).toString("base64url") + "." + sig;
  assert.equal(await verifySession(forged, T0 + 1000), null);
  assert.equal(await verifySession(body + ".AAAA", T0), null);
  assert.equal(await verifySession(tok, T0 + 13 * 3600_000), null);
  assert.equal(await verifySession("garbage", T0), null);
});

test("rollen: Rangfolge", () => {
  assert.ok(hasRole("admin", "operator"));
  assert.ok(hasRole("operator", "viewer"));
  assert.ok(!hasRole("viewer", "operator"));
});

test("rate-limit greift nach Limit", () => {
  const k = "test-" + Math.random();
  for (let i = 0; i < 3; i++) assert.ok(rateLimit(k, 3, 1000, T0).ok);
  assert.equal(rateLimit(k, 3, 1000, T0).ok, false);
  assert.ok(rateLimit(k, 3, 1000, T0 + 2000).ok);
});

// ── Schreibschutz / Edge-Ehrlichkeit ────────────────────────
test("write-guard lehnt Schreib-Formen ab", () => {
  assert.equal(guardTelemetry({ machineId: "m-af12", values: { temp: 1 } }).ok, true);
  assert.equal(guardTelemetry({ machineId: "m-af12", write: { x: 1 }, values: { a: 1 } }).ok, false);
  assert.equal(guardTelemetry({ values: { Sollwert_Temp: 1 } }).ok, false);
  assert.equal(guardTelemetry({ values: { motor_setpoint: 1 } }).ok, false);
  assert.equal(checkTagName("shutdown_line").ok, false);
  assert.equal(checkTagName("Motorstrom").ok, true);
});

test("S7-Honesty: SIMULATED bleibt SIMULATED, S7 braucht Adresse/readProof", () => {
  const sim = enforceS7EdgeHonesty({ origin: "SIMULATED_EDGE", values: { a: 1 } });
  assert.ok(sim.ok && sim.origin === "SIMULATED_EDGE" && !sim.s7Verified);
  assert.equal(enforceS7EdgeHonesty({ origin: "S7_EDGE", values: { a: 1 } }).ok, false);
  assert.equal(enforceS7EdgeHonesty({ origin: "S7_EDGE", values: { a: 1 }, addresses: { a: "DB10.DBD4" }, note: "stub fallback" }).ok, false);
  const s7 = enforceS7EdgeHonesty({ origin: "S7_EDGE", values: { a: 1 }, addresses: { a: "DB10.DBD4" } });
  assert.ok(s7.ok && s7.origin === "S7_EDGE");
  assert.equal(enforceS7EdgeHonesty({ origin: "S7_EDGE", values: { a: "x" as unknown as number }, addresses: { a: "DB10.DBD4" } }).ok, false);
  assert.ok(isS7Address("DB10.DBX0.0") && isS7Address("M 0.1".replace(" ", "")) && !isS7Address("foo"));
});

test("freshness: frisch / verzögert / veraltet / kein Edge", () => {
  assert.equal(freshness(T0 - 5000, null, T0), "frisch");
  assert.equal(freshness(T0 - 30_000, T0 - 20_000, T0), "verzögert");
  assert.equal(freshness(T0 - 300_000, T0 - 300_000, T0), "veraltet");
  assert.equal(freshness(null, null, T0), "kein Edge");
});

// ── Stecker-Verdacht TT-214 ─────────────────────────────────
test("TT-214 Fixture: Score 45, Stufe verdacht, exakte Nachricht", () => {
  const r = assessConnector(tt214ExampleInput());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.score, 45);
  assert.equal(r.stufe, "verdacht");
  assert.equal(
    r.nachricht,
    "Sensor TT-214: Signalqualität auffällig (Rauschen 2,4×, 9 Aussetzer/24 h, Vergleichssensor stabil). Verdacht Steckverbindung oxidiert/korrodiert oder Sensor defekt. Stecker prüfen, bevor der Sensor getauscht wird.",
  );
  assert.deepEqual(r.ignoriert, ["laufzeit_ms"]);
  assert.deepEqual(r.limits, { keinShutdown: true, keineSollwertaenderung: true, keinAuftragOhneFreigabe: true });
});

test("Stecker-Verdacht: Pflichtfelder, Deckel ohne Baseline, ok-Fall", () => {
  const e = assessConnector({ sensor_id: "X" });
  assert.equal(e.ok, false);
  if (!e.ok) assert.match(e.nachricht, /^Eingabe unvollständig\. Fehlende Felder: anlage, ort, signalart, zeitreihe$/);
  const noBase = assessConnector({ ...tt214ExampleInput(), baseline: undefined, aussetzer_24h: 20, versorgung_pct: 80 });
  assert.ok(noBase.ok && noBase.score <= 39 && noBase.stufe === "beobachten");
  const ok = assessConnector({ ...tt214ExampleInput(), aussetzer_24h: 0, zeitreihe: [{ wert: 12, zeitstempel: "x" }, { wert: 12.01, zeitstempel: "y" }] , vergleichssensor: undefined });
  assert.ok(ok.ok && ok.stufe === "ok");
  if (ok.ok) assert.equal(ok.nachricht, "Sensor TT-214: Signalqualität unauffällig. Kein Verdacht auf oxidierte Steckverbindung.");
});

// ── Tickets ─────────────────────────────────────────────────
test("dedupe-Schlüssel: RCA vor Alert, manuell nie", () => {
  assert.equal(dedupeKey({ title: "[RCA] MOT-REIB · AF-12 · x", machineId: "m-af12", alertId: "a1" }), "rca|m-af12|MOT-REIB");
  assert.equal(dedupeKey({ title: "Temp hoch", machineId: "m-af12", alertId: "a1" }), "alert|a1");
  assert.equal(dedupeKey({ title: "Manuell", machineId: "m-af12", alertId: null }), null);
});

test("neues Auto-Ticket hängt sich an offenes an; manuell nie", () => {
  const ts: Ticket[] = [];
  const a = applyNewTicket(ts, { title: "[RCA] MOT-REIB · AF-12 · x", machineId: "m-af12", createdBy: "t", source: "rca" });
  const b = applyNewTicket(ts, { title: "[RCA] MOT-REIB · AF-12 · y", machineId: "m-af12", createdBy: "t", source: "copilot" });
  assert.equal(a.deduped, false);
  assert.equal(b.deduped, true);
  assert.equal(ts.length, 1);
  assert.equal(ts[0].reportCount, 2);
  applyNewTicket(ts, { title: "Manuell", createdBy: "t" });
  applyNewTicket(ts, { title: "Manuell", createdBy: "t" });
  assert.equal(ts.length, 3);
  ts[0].status = "DONE";
  const c = applyNewTicket(ts, { title: "[RCA] MOT-REIB · AF-12 · z", machineId: "m-af12", createdBy: "t" });
  assert.equal(c.deduped, false, "erledigte Tickets werden nicht wiederbelebt");
});

test("consolidate: ältestes bleibt, Rest DONE + mergedInto, nichts gelöscht", () => {
  const base = { description: "", machineId: "m-af12", alertId: "a1", priority: "medium", updatedAt: "", createdBy: "t", source: "alert", dedupeKey: "alert|a1", reportCount: 1, lastReportedAt: "" } as const;
  const ts: Ticket[] = [
    { ...base, id: "t2", title: "b", status: "OPEN", createdAt: "2026-10-05T02:00:00Z" },
    { ...base, id: "t1", title: "a", status: "IN_PROGRESS", createdAt: "2026-10-05T01:00:00Z" },
  ];
  const r = consolidate(ts);
  assert.equal(r.merged, 1);
  assert.equal(ts.length, 2);
  assert.equal(ts.find((t) => t.id === "t2")!.mergedInto, "t1");
  assert.equal(ts.find((t) => t.id === "t1")!.reportCount, 2);
});

// ── Twin / Physik ───────────────────────────────────────────
test("physik: Kipprisiko steigt mit Geschwindigkeit und Format", () => {
  const slow = computePhysics(40, "1.0");
  const fast = computePhysics(100, "1.0");
  assert.ok(fast.tipRiskPct > slow.tipRiskPct);
  assert.ok(computePhysics(100, "1.5").tipRiskPct > computePhysics(100, "0.5").tipRiskPct);
  assert.ok(maxSafeSpeed("1.5") <= maxSafeSpeed("0.5"));
});

test("twin: Labels kurz, Komponenten-Health aus Vorfall", () => {
  assert.equal(shortComponentLabel("Füller FC-01 · 12 Ventile"), "Füller FC-01");
  assert.equal(shortComponentLabel("Ein sehr langer Komponentenname"), "Ein sehr langer K…");
  const pts = series("m-ft7", T0 - 6 * 3600_000, T0, 60_000);
  const f = pts.find((p) => p.state === "FAULT")!;
  const tw = buildTwin(f);
  assert.equal(tw.components.find((c) => c.id === "ft-m-b")?.health, "FAULT");
});

// ── Copilot / RCA ───────────────────────────────────────────
test("copilot-scope: Off-Topic und Steuerung werden abgelehnt", () => {
  assert.equal(classifyPlantScope("Wie wird das Wetter morgen?"), "offtopic");
  assert.equal(classifyPlantScope("Stoppe die AF-12"), "control");
  assert.equal(classifyPlantScope("Setze den Sollwert auf 80"), "control");
  assert.equal(classifyPlantScope("Schalte die FT-7 ab"), "control");
  assert.equal(classifyPlantScope("Fahr die Linie herunter!"), "control");
  assert.equal(classifyPlantScope("Mach den Tunnel aus"), "control");
  assert.equal(classifyPlantScope("Warum ist AF-12 in Warnung?"), "plant");
  assert.equal(classifyPlantScope("Wie hoch ist die OEE an der AF-12?"), "plant");
  assert.ok(wantsTicketFromRca("Ticket aus RCA für FT-7"));
  const ctx = { tickets: [], alerts: [], now: T0 };
  assert.equal(answerLocal("Wer wird Fußballmeister?", ctx).text, PLANT_SCOPE_REFUSAL);
  assert.equal(answerLocal("Schalte FT-7 ab", ctx).text, CONTROL_REFUSAL);
});

test("RCA: FT-7 Störung → MOT-BLOCK; Copilot Ticket aus RCA liefert [RCA]-Titel", () => {
  const pts = series("m-ft7", T0 - 6 * 3600_000, T0, 60_000);
  const f = pts.filter((p) => p.state === "FAULT").at(-1)!;
  const r = runRca(f);
  assert.equal(r.hypotheses[0]?.code, "MOT-BLOCK");
  const ans = answerLocal("Ticket aus RCA für FT-7", { tickets: [], alerts: [], snapshotFor: () => f });
  assert.equal(ans.kind, "ticket-request");
  assert.match(ans.ticketRequest!.title, /^\[RCA\] MOT-BLOCK · FT-7 · /);
});

// ── Meldungen / Übergabe / PDF ──────────────────────────────
test("alerts: stabile IDs, Status aus Store", () => {
  const a1 = deriveAlerts({}, T0);
  const a2 = deriveAlerts({}, T0);
  assert.deepEqual(a1.map((a) => a.id), a2.map((a) => a.id));
  assert.ok(a1.length > 0);
  const id = a1[0].id;
  const a3 = deriveAlerts({ [id]: { id, acknowledgedAt: "x", acknowledgedBy: "u", comments: [] } }, T0);
  assert.equal(a3.find((a) => a.id === id)!.status, "ACKNOWLEDGED");
});

test("übergabe: Klartext + PDF mit Fußzeilen, gültigem Kopf/xref", () => {
  const h = buildHandover({ now: T0, user: "Demo", tickets: [], alerts: deriveAlerts({}, T0) });
  const txt = handoverPlainText(h);
  assert.match(txt, /Schichtübergabe/);
  assert.match(txt, /Trust: Supervised/);
  const pdf = Buffer.from(handoverPdf(h)).toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.ok(pdf.trimEnd().endsWith("%%EOF"));
  assert.match(pdf, /Seite 1\/\d/);
  assert.match(pdf, /Trust: Supervised/);
  const xrefPos = Number(/startxref\n(\d+)/.exec(pdf)![1]);
  assert.equal(pdf.slice(xrefPos, xrefPos + 4), "xref");
  assert.equal(pdfEscape("Übergabe (ä)"), "\\334bergabe \\(\\344\\)");
  assert.equal(handoverFilename(new Date(T0)), "schichtuebergabe-2026-10-05-1000.pdf");
});

// ── Symbolliste / Historie ──────────────────────────────────
test("symbolliste: gültige/ungültige Zeilen, Multi-Anlage, PDF abgelehnt", () => {
  const csv = "Name;Adresse;Datentyp;Kommentar\nM1;DB10.DBD4;REAL;Motorstrom Hauptantrieb\nB1;I2.1;BOOL;LS-17\nX;FOO;REAL;kaputt\nsetpoint_temp;DB10.DBD20;REAL;nein";
  const r = parseSymbolList(csv, { defaultMachineId: "m-af12" });
  assert.equal(r.validCount, 2);
  assert.equal(r.invalidCount, 2);
  const multi = parseSymbolList("Name;Adresse;Datentyp;Kommentar;Anlage\nM1;DB10.DBD4;REAL;x;AF-12\nM2;DB20.DBD4;REAL;y;Unbekannt", { multi: true });
  assert.equal(multi.rows[0].machineId, "m-af12");
  assert.equal(multi.rows[1].valid, false);
  assert.equal(parseSymbolList("%PDF-1.4 ...").ok, false);
});

test("historie: Anomalie-Fenster werden gefunden", () => {
  const r = detectAnomalies("m-vl3", T0 - 6 * 3600_000, T0);
  assert.ok(r.windows.some((w) => w.signal === "temperatureC"));
});

test("store: mutateStore schreibt atomar in PLANTOS_DATA_DIR", async () => {
  process.env.PLANTOS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "plantos-"));
  const { mutateStore, readStore, __resetStoreCache } = await import("../store/store");
  __resetStoreCache();
  await Promise.all([1, 2, 3].map((i) => mutateStore((s) => { s.tickets.push({ id: `t${i}` } as Ticket); })));
  __resetStoreCache();
  const s = await readStore();
  assert.equal(s.tickets.length, 3);
});
