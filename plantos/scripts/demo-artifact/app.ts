/**
 * plantOS Browser-Demo: dieselben Engines wie die Web-App (Demo-Engine, Plant Brain, Predictive,
 * Cross-Plant, Planer, ROI, Copilot) laufen hier vollständig im Browser – ohne Server.
 * Build: npm run demo:artifact  →  dist/plantos-demo.html
 */
import { buildDemoGraph } from "../../src/lib/graph/seed";
import { GraphIndex } from "../../src/lib/graph/queries";
import { NODE_LABEL, EDGE_LABEL, type GraphNode } from "../../src/lib/graph/model";
import { buildDemoMemory } from "../../src/lib/memory/seed";
import { MEMORY_LABEL } from "../../src/lib/memory/model";
import { predictAsset, type Prediction } from "../../src/lib/predictive/engine";
import { findSimilarCases } from "../../src/lib/crossplant/similarity";
import { machineMetrics, rollup, type MachineMetrics } from "../../src/lib/enterprise/rollup";
import { planMaintenance, type PlanItem } from "../../src/lib/maintenance/planner";
import { analyzeEnergy } from "../../src/lib/energy/analysis";
import { analyzeQuality } from "../../src/lib/quality/analysis";
import { DEMO_ROI_CONFIG, effectiveConfig } from "../../src/lib/roi/engine";
import { valueItems, summarizeValue } from "../../src/lib/roi/ledger";
import { answerEnterprise } from "../../src/lib/copilot/enterprise";
import { answerLocal } from "../../src/lib/copilot/answer";
import { classifyPlantScope } from "../../src/lib/copilot/scope";
import { deriveAlerts } from "../../src/lib/alerts";
import { assetSnapshot } from "../../src/lib/assets/telemetry";
import { TENANTS } from "../../src/lib/tenant/tenants";

// ── Daten aufbauen (einmalig) ──────────────────────────────────────────────
const now = Date.now();
const tenant = TENANTS[0];
const g = new GraphIndex(buildDemoGraph("demo", now));
const memory = buildDemoMemory("demo", g, now).sort((a, b) => b.at.localeCompare(a.at));
const brain = { tenant, g, memory };
const machines = g.machinesUnder("co");
const preds: Prediction[] = machines.map((m) => {
  const p = predictAsset(m, g, memory, now);
  if (p.failureMode) p.explanation.similarCases = findSimilarCases(tenant, g, memory, m, now).cases.map((c) => ({ title: c.title, similarityPct: c.similarityPct, plant: c.plant, assetId: c.assetId, memoryId: c.memoryId }));
  return p;
});
const values = valueItems(g, memory);
const metrics = new Map<string, MachineMetrics>(machines.map((m) => [m.id, machineMetrics(m, g, preds.find((p) => p.assetId === m.id), values, now)]));
const plan: PlanItem[] = planMaintenance(g, preds, DEMO_ROI_CONFIG, now);
const alerts = deriveAlerts({}, now);
let energyCache: ReturnType<typeof energyRows> | null = null;
function energyRows() {
  return machines.map((m) => ({ ...analyzeEnergy(m, effectiveConfig(DEMO_ROI_CONFIG, g.ancestorOfType(m.id, "plant")?.id).energyPricePerKwh, now, 7), assetId: m.id }));
}
const energy = () => (energyCache ??= energyRows());

// ── Helfer ─────────────────────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const de = (n: number, d = 1) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const date = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) : "–");
const PRIO: Record<string, string> = { P1: "fault", P2: "warn", P3: "accent", P4: "muted" };
const pill = (tone: string, txt: string) => `<span class="pill ${tone}">${esc(txt)}</span>`;
const stateTone = (s: string) => (s === "FAULT" ? "fault" : s === "WARN" ? "warn" : s === "STOPPED" ? "muted" : "ok");
const stateDe = (s: string) => (s === "FAULT" ? "Störung" : s === "WARN" ? "Warnung" : s === "STOPPED" ? "Stillstand" : "Läuft");

function spark(vals: number[], warn?: number, alarm?: number): string {
  const W = 320, H = 90, P = 6;
  const all = [...vals, ...(alarm != null ? [alarm] : []), ...(warn != null ? [warn] : [])];
  const lo = Math.min(...all) * 0.95, hi = Math.max(...all) * 1.02;
  const x = (i: number) => P + (i / Math.max(1, vals.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${x(vals.length - 1)},${H - P}L${x(0)},${H - P}Z`;
  const guide = (v: number | undefined, cls: string, lbl: string) => (v == null ? "" : `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" class="${cls}"/><text x="${W - P}" y="${y(v) - 3}" text-anchor="end" class="glabel">${lbl} ${de(v, 1)}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" role="img" aria-label="Trend"><path d="${area}" class="area"/><path d="${line}" class="line"/>${guide(warn, "gwarn", "Warn")}${guide(alarm, "galarm", "Alarm")}<circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="3" class="dot"/></svg>`;
}

// ── Zustand ────────────────────────────────────────────────────────────────
type Tab = "mgmt" | "brain" | "pred" | "plan" | "ai";
const state = { tab: "mgmt" as Tab, scope: "co", asset: "m-sued-fb03-motor", pred: preds.slice().sort((a, b) => b.riskScore - a.riskScore)[0].assetId, q: "", chat: [] as { who: "me" | "ai"; text: string; src?: string[]; kind?: string }[] };

// ── Ansichten ──────────────────────────────────────────────────────────────
function viewMgmt(): string {
  const r = rollup(g, state.scope, metrics, 1)!;
  const ids = new Set([state.scope, ...g.descendants(state.scope).map((n) => n.id)]);
  const v = summarizeValue(values, ids, now);
  const tile = (label: string, val: string, hint = "", tone = "") => `<div class="tile ${tone}"><div class="lbl">${esc(label)}</div><div class="num">${val}</div>${hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`;
  return `
  <section class="tiles">
    ${tile("OEE (8 h)", `${de(r.oeePct)}<small> %</small>`, `Verfügbarkeit ${de(r.availabilityPct)} %`)}
    ${tile("Stillstand 24 h", `${r.stopMinutes24h}<small> min</small>`, `${r.alarms24h} Alarmfenster`)}
    ${tile("Predictive-Alerts", String(r.predictiveAlerts), `max. Risiko ${r.riskMax}/100`, r.predictiveAlerts ? "t-warn" : "")}
    ${tile("Wartung ≤ 14 Tage", String(r.maintenanceDue14d), "Vorschläge im Planer")}
    ${tile("Teile < Mindestbestand", String(r.sparePartsBelowMin), "SAP-Demo-Adapter", r.sparePartsBelowMin ? "t-fault" : "")}
    ${tile("Qualität (8 h)", `${de(r.qualityPct)}<small> %</small>`)}
    ${tile("Energie 24 h", `${Math.round(r.energyKwh24h).toLocaleString("de-DE")}<small> kWh</small>`)}
    ${tile("Vermiedene Kosten (Jahr)", eur(v.periods.year.realized), v.periods.year.realizedDemo ? `+ ${eur(v.periods.year.realizedDemo)} DEMO-Werte (nicht real)` : "nur verifizierte Ergebnisse")}
  </section>
  <div class="cols">
    <section class="panel">
      <h2>Top-Risiken</h2>
      ${r.critical.length ? `<ul class="list">${r.critical.map((c) => `<li><button class="row" data-pred="${esc(c.assetId)}">${pill(PRIO[c.priority], c.priority)}<b>${esc(c.code)}</b><span class="muted">${esc(g.ancestorOfType(c.assetId, "plant")?.name)}</span><span class="right tab">Risiko ${c.riskScore}</span></button></li>`).join("")}</ul>` : `<p class="muted">Keine Maschine mit erhöhtem Risiko in diesem Bereich.</p>`}
    </section>
    <section class="panel">
      <h2>Ebenen</h2>
      <div class="scroll"><table><thead><tr><th>Einheit</th><th>OEE</th><th>Stopp min</th><th>Risiko</th><th>Teile</th></tr></thead><tbody>
      ${r.children.map((c) => `<tr><td>${c.type === "machine" ? `<button class="link" data-asset="${esc(c.id)}">${esc(c.name)}</button>` : `<button class="link" data-scope="${esc(c.id)}">${esc(c.name)}</button>`}<div class="sub">${esc(NODE_LABEL[c.type as keyof typeof NODE_LABEL])} · ${c.machines} Masch.</div></td><td class="tab">${de(c.oeePct)} %</td><td class="tab">${c.stopMinutes24h}</td><td class="tab">${c.riskMax}</td><td class="tab ${c.sparePartsBelowMin ? "fault-t" : ""}">${c.sparePartsBelowMin}</td></tr>`).join("")}
      </tbody></table></div>
    </section>
  </div>`;
}

function viewBrain(): string {
  const n = g.node(state.asset) ?? g.node("co")!;
  const hits = state.q.trim() ? g.search(state.q, { limit: 30 }) : [];
  const rels = g.related(n.id).filter((r) => r.edge.type !== "partOf");
  const kids = g.children(n.id);
  const sub = new Set([n.id, ...g.descendants(n.id).map((x) => x.id)]);
  const hist = memory.filter((m) => sub.has(m.assetId)).slice(0, 8);
  const crumbs = [...g.ancestors(n.id)].reverse();
  const ring = [...(g.parent(n.id) ? [{ node: g.parent(n.id)!, label: "gehört zu" }] : []), ...rels.slice(0, 8).map((r) => ({ node: r.node, label: r.dir === "out" ? EDGE_LABEL[r.edge.type] : `← ${EDGE_LABEL[r.edge.type]}` })), ...kids.slice(0, Math.max(0, 11 - rels.length)).map((k) => ({ node: k, label: "Bestandteil" }))];
  const W = 640, H = 320, cx = W / 2, cy = H / 2;
  const short = (s: string, k = 18) => (s.length > k ? s.slice(0, k - 1) + "…" : s);
  const graph = `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="Beziehungen">${ring.map((r, i) => {
    const a = (i / Math.max(1, ring.length)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * 235, y = cy + Math.sin(a) * 120;
    return `<g class="gnode" data-asset="${esc(r.node.id)}"><line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/><text x="${(cx + x) / 2}" y="${(cy + y) / 2 - 3}" class="elabel" text-anchor="middle">${esc(short(r.label, 22))}</text><rect x="${x - 62}" y="${y - 15}" width="124" height="30" rx="4"/><text x="${x}" y="${y - 1}" text-anchor="middle" class="nname">${esc(short(r.node.name))}</text><text x="${x}" y="${y + 10}" text-anchor="middle" class="ntype">${esc(NODE_LABEL[r.node.type])}</text></g>`;
  }).join("")}<rect x="${cx - 80}" y="${cy - 20}" width="160" height="40" rx="5" class="center"/><text x="${cx}" y="${cy - 2}" text-anchor="middle" class="cname">${esc(short(n.name, 22))}</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" class="ctype">${esc(NODE_LABEL[n.type])}</text></svg>`;
  return `
  <div class="cols wide">
    <section class="panel">
      <label class="search"><span class="sr">Suche im Plant Brain</span><input id="q" value="${esc(state.q)}" placeholder="Suche: M12, Lager, DB12, 4711, Werk Süd …" autocomplete="off"/></label>
      ${hits.length ? `<ul class="list hits">${hits.map((h) => `<li><button class="row" data-asset="${esc(h.id)}"><b>${esc(h.name)}</b>${h.code ? `<span class="mono muted">${esc(h.code)}</span>` : ""}<span class="right sub">${esc(NODE_LABEL[h.type])}</span></button><div class="sub pad">${esc(g.pathOf(h.id))}</div></li>`).join("")}</ul>` : state.q ? `<p class="muted">Keine Treffer.</p>` : `<p class="muted small">Tipp: „M12“ zeigt das Beispiel Motor M12 → Förderband FB03 → Linie 2 → SPS PLC01 → Tag DB12.DBD4 → SAP-Material 4711.</p>`}
      <h3>Pfad</h3>
      <nav class="crumbs">${crumbs.map((c) => `<button class="link" data-asset="${esc(c.id)}">${esc(c.name)}</button>`).join(" › ")}${crumbs.length ? " › " : ""}<b>${esc(n.name)}</b></nav>
      ${kids.length ? `<h3>Bestandteile (${kids.length})</h3><ul class="list">${kids.slice(0, 14).map((k) => `<li><button class="row" data-asset="${esc(k.id)}">${esc(k.name)}${k.code ? `<span class="mono muted">${esc(k.code)}</span>` : ""}<span class="right sub">${esc(NODE_LABEL[k.type])}</span></button></li>`).join("")}</ul>` : ""}
    </section>
    <section class="panel">
      <div class="head"><div><div class="eyebrow">${esc(NODE_LABEL[n.type])}</div><h2 class="big">${esc(n.name)}</h2><div class="sub mono">${esc(n.code ?? "")}</div></div>${pill("warn", "DEMO")}</div>
      <div class="scroll">${graph}</div>
      <ul class="rels">${rels.map((r) => `<li><span class="muted">${esc(r.dir === "out" ? EDGE_LABEL[r.edge.type] : "← " + EDGE_LABEL[r.edge.type])}</span> <button class="link" data-asset="${esc(r.node.id)}">${esc(r.node.name)}</button> ${r.node.code ? `<span class="mono small">${esc(r.node.code)}</span>` : ""}</li>`).join("") || `<li class="muted">Keine Querbeziehungen.</li>`}</ul>
      <h3>Industrial Memory</h3>
      ${hist.length ? `<ol class="mem">${hist.map((m) => `<li><div>${pill(m.type === "fault" ? "fault" : m.type === "outcome" ? "ok" : m.type === "aiRecommendation" ? "accent" : "muted", MEMORY_LABEL[m.type])} <span class="sub">${date(m.at)} · ${esc(m.actor)}</span>${m.confidence != null ? ` ${pill("accent", `Confidence ${Math.round(m.confidence * 100)} %`)}` : ""}</div><p>${esc(m.description)}</p></li>`).join("")}</ol>` : `<p class="muted">Keine Einträge.</p>`}
    </section>
  </div>`;
}

function viewPred(): string {
  const list = preds.slice().sort((a, b) => b.riskScore - a.riskScore);
  const p = preds.find((x) => x.assetId === state.pred)!;
  const t = p.trends.find((x) => x.signal === p.dominant) ?? p.trends[0];
  const e = p.explanation;
  return `
  <div class="cols wide">
    <section class="panel">
      <h2>Prognosen (alle Werke)</h2>
      <ul class="list">${list.map((x) => `<li><button class="row ${x.assetId === p.assetId ? "on" : ""}" data-pred="${esc(x.assetId)}">${pill(PRIO[x.priority], x.priority)}<b>${esc(x.code)}</b><span class="muted">${esc(g.ancestorOfType(x.assetId, "plant")?.name)}</span><span class="right tab">${x.riskScore}</span></button></li>`).join("")}</ul>
      <p class="small muted">Restlebensdauer nur bei belastbarem Trend (R² ≥ 0,7, |t| ≥ 4, ≥ 10 Tage). Sonst: „Nicht genügend Daten für eine belastbare Restlebensdauerprognose.“</p>
    </section>
    <section class="panel">
      <div class="head"><div><div class="eyebrow">${esc(g.pathOf(p.assetId))}</div><h2 class="big">${esc(p.name)}</h2></div><div>${pill(PRIO[p.priority], `${p.priority} · Risiko ${p.riskScore}`)} ${pill("warn", "DEMO")}</div></div>
      <div class="rul ${p.rul ? "" : "none"}">${esc(p.rulText)}</div>
      ${p.failureMode ? `<p>Wahrscheinlicher Fehlermodus: <b>${esc(p.failureMode)}</b> · Ausfallwahrscheinlichkeit 30 Tage ${Math.round(p.failureProbability30d * 100)} %</p>` : ""}
      ${p.window ? `<div class="window">Wartungsfenster: <b>${date(p.window.from)} – ${date(p.window.to)}</b><div class="sub">${esc(p.window.reason)}</div></div>` : ""}
      <h3>${esc(t.label)} · Tagesmediane (${esc(t.unit)})</h3>
      ${spark(t.daily.map((d) => d.value), t.limit?.warn, t.limit?.alarm)}
      <div class="scroll"><table><thead><tr><th>Signal</th><th>Niveau</th><th>Trend/Tag</th><th>R²</th><th>bis Alarm</th></tr></thead><tbody>${p.trends.map((x) => `<tr><td>${esc(x.label)}</td><td class="tab">${de(x.level, 2)} ${esc(x.unit)}</td><td class="tab">${x.slopePerDay > 0 ? "+" : ""}${de(x.slopePerDay, 3)}</td><td class="tab">${de(x.r2, 2)}</td><td class="tab">${x.daysToAlarm != null ? `${de(x.daysToAlarm, 1)} T.` : x.beyondHorizon ? "> Horizont" : "–"}</td></tr>`).join("")}</tbody></table></div>
      <h3>Warum? (Explainable AI)</h3>
      <div class="explain">
        <div>${pill(e.confidence.label === "hoch" ? "ok" : e.confidence.label === "mittel" ? "accent" : "muted", `Confidence ${e.confidence.label} · ${Math.round(e.confidence.score * 100)} %`)} <span class="sub">${esc(e.confidence.why)}</span></div>
        <ul>${e.reasoning.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
        ${e.similarCases.length ? `<p><b>Ähnliche Fälle:</b> ${e.similarCases.map((c) => `${c.similarityPct} % · ${esc(c.plant)}: ${esc(c.title)}`).join("; ")}</p>` : ""}
        ${e.alternatives.length ? `<p><b>Alternative Ursachen:</b> ${e.alternatives.map(esc).join(", ")}</p>` : ""}
        <p><b>Fehlende Daten:</b> ${e.missingData.map(esc).join(" · ")}</p>
        <p><b>Nächste Prüfung:</b> ${esc(e.nextCheck)}</p>
      </div>
    </section>
  </div>`;
}

function viewPlan(): string {
  return `
  <section class="panel">
    <h2>Wartungsplaner</h2>
    <p class="small muted">Prognose + Ersatzteilbestand + Lieferzeit + Umlagerung aus anderen Werken + Wartungsfenster + Techniker. Vorschläge – keine automatische Buchung.</p>
    ${plan.length ? `<ul class="plan">${plan.map((i) => `
      <li>
        <div class="phead">${pill(PRIO[i.priority], i.priority)}<button class="link" data-pred="${esc(i.assetId)}"><b>${esc(i.code)}</b></button><span class="muted">${esc(i.plant)} · ${esc(i.line)}</span><span class="right">${pill(i.slotType === "geplantes Wartungsfenster" ? "ok" : "warn", i.slotType)}</span></div>
        <div class="grid4">
          <div><div class="lbl">Termin</div>${dt(i.recommendedStart)} · ${i.durationHours} h</div>
          <div><div class="lbl">Spätestens</div>${dt(i.deadline)}</div>
          <div><div class="lbl">Zusätzl. Stillstand</div>${i.expectedDowntimeHours} h · ${i.technicians} Techn.</div>
          <div><div class="lbl">Risiko bei +7 Tagen</div>${de(i.failureRiskIfPostponed7dPct)} %</div>
        </div>
        <p class="small">${esc(i.failureMode)} · Teile: ${i.parts.map((pt) => `<span class="${pt.available ? "" : pt.transfer ? "warn-t" : "fault-t"}">${pt.qty}× ${esc(pt.name)} (SAP ${esc(pt.material)}${pt.available ? `, Bestand ${pt.stock}` : pt.transfer ? `, Umlagerung aus ${esc(pt.transfer.fromPlant)} ${pt.transfer.days} T. – Annahme` : `, Lieferzeit ${pt.leadTimeDays} T.`})</span>`).join(", ") || "keine"}</p>
        <p class="small">Kosten Maßnahme ${eur(i.cost.costOfAction)} · Nicht-Handeln ${eur(i.cost.costIfNoAction)} · <b>Netto ${eur(i.cost.netBenefit)}</b> ${pill("warn", "DEMO-Annahmen")}</p>
        <ul class="reasons">${i.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      </li>`).join("")}</ul>` : `<p class="muted">Keine Wartung aus Prognose erforderlich.</p>`}
  </section>`;
}

const CHIPS = ["Welche Maschinen sind aktuell kritisch?", "Welche Ersatzteile fehlen?", "Welche Linie verursacht die meisten Kosten?", "Welche Wartung sollte diese Woche geplant werden?", "Wo gibt es Energiepotenzial?", "Welche Maschine ähnelt einem früheren Ausfall?", "Warum steht AF-24?", "Schalte die FT-7 ab"];

function viewAi(): string {
  return `
  <section class="panel chat">
    <h2>Anlagen-Copilot</h2>
    <p class="small muted">Antwortet nur aus plantOS-Daten (Plant Brain, Memory, Predictive, Planer, ROI). Steuern kann er nichts.</p>
    <div class="msgs" id="msgs">${state.chat.length ? state.chat.map((m) => `<div class="msg ${m.who} ${m.kind ?? ""}"><div class="bubble">${esc(m.text)}${m.src?.length ? `<div class="src">Quelle: ${m.src.map(esc).join(" · ")}</div>` : ""}</div></div>`).join("") : `<p class="muted">Frage stellen oder einen Vorschlag antippen.</p>`}</div>
    <div class="chips">${CHIPS.map((c) => `<button class="chip" data-ask="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    <form id="askf" class="ask"><label class="sr" for="ask">Frage</label><input id="ask" placeholder="Frage zur Anlage …" autocomplete="off"/><button class="btn" type="submit">Senden</button></form>
  </section>`;
}

function ask(q: string) {
  if (!q.trim()) return;
  state.chat.push({ who: "me", text: q });
  let text: string, src: string[] = [], kind = "";
  if (classifyPlantScope(q) === "plant") {
    const ent = answerEnterprise(q, { brain, preds, metrics, cfg: DEMO_ROI_CONFIG, tickets: [], alerts, scopeId: state.scope, now, plan: () => plan, energy, similar: (m: GraphNode) => findSimilarCases(tenant, g, memory, m, now).cases });
    if (ent) { text = ent.text; src = ent.sources; }
    else { const a = answerLocal(q, { tickets: [], alerts, now }); text = a.text; src = a.sources; kind = a.kind; }
  } else {
    const a = answerLocal(q, { tickets: [], alerts, now });
    text = a.text; src = a.sources; kind = a.kind;
  }
  state.chat.push({ who: "ai", text, src, kind });
  render();
  requestAnimationFrame(() => { const el = document.getElementById("msgs"); if (el) el.scrollTop = el.scrollHeight; });
}

// ── Rahmen ─────────────────────────────────────────────────────────────────
const TABS: [Tab, string][] = [["mgmt", "Management"], ["brain", "Plant Brain"], ["pred", "Predictive"], ["plan", "Wartungsplaner"], ["ai", "Copilot"]];
const scopes = (() => {
  const out: { id: string; label: string }[] = [];
  const walk = (id: string, d: number) => {
    const n = g.node(id)!;
    if (["company", "region", "country", "plant", "line"].includes(n.type)) out.push({ id, label: `${"  ".repeat(d)}${n.name} · ${NODE_LABEL[n.type]}` });
    for (const c of g.children(id).filter((c) => ["region", "country", "site", "plant", "area", "line"].includes(c.type))) walk(c.id, ["company", "region", "country", "plant", "line"].includes(n.type) ? d + 1 : d);
  };
  walk("co", 0);
  return out;
})();

function live(): string {
  return ["m-af12", "m-vl3", "m-ft7"].map((id) => {
    const s = assetSnapshot(g.node(id)!, Date.now());
    return `<span class="lv">${pill(stateTone(s.state), stateDe(s.state))} <b>${esc(g.node(id)!.code)}</b> <span class="tab">${de(s.signals.outputRate, 0)}</span> <span class="sub">${esc(String(g.node(id)!.props.unit))}</span></span>`;
  }).join("");
}

function render() {
  const root = document.getElementById("app")!;
  const body = state.tab === "mgmt" ? viewMgmt() : state.tab === "brain" ? viewBrain() : state.tab === "pred" ? viewPred() : state.tab === "plan" ? viewPlan() : viewAi();
  const focused = document.activeElement?.id;
  root.innerHTML = `
  <header class="top">
    <div class="brand"><span class="logo" aria-hidden="true"></span><span>plant<em>OS</em></span>${pill("warn", "DEMO")}</div>
    <label class="scope"><span class="sr">Werk / Ebene</span><select id="scope">${scopes.map((s) => `<option value="${s.id}" ${s.id === state.scope ? "selected" : ""}>${s.label}</option>`).join("")}</select></label>
  </header>
  <div class="livebar" id="live">${live()}</div>
  <nav class="tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" aria-selected="${state.tab === id}" class="${state.tab === id ? "on" : ""}" data-tab="${id}">${l}</button>`).join("")}</nav>
  <main>${body}</main>
  <footer>Browser-Demo von plantOS: dieselben Engines wie die Web-App, gerechnet in deinem Browser. Alle Werte sind DEMO-Daten aus der deterministischen Demo-Engine – keine Kunden-SPS, kein SAP. READ ONLY gegenüber Maschinen.</footer>`;
  if (focused === "q") { const q = document.getElementById("q") as HTMLInputElement; q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

document.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest("[data-tab],[data-asset],[data-pred],[data-scope],[data-ask]") as HTMLElement | null;
  if (!t) return;
  if (t.dataset.tab) state.tab = t.dataset.tab as Tab;
  if (t.dataset.asset) { state.asset = t.dataset.asset; state.tab = "brain"; state.q = ""; }
  if (t.dataset.pred) { const m = g.ancestorOfType(t.dataset.pred, "machine"); if (m) { state.pred = m.id; state.tab = "pred"; } }
  if (t.dataset.scope) state.scope = t.dataset.scope;
  if (t.dataset.ask) { ask(t.dataset.ask); return; }
  render();
  window.scrollTo({ top: 0 });
});
document.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "q") { state.q = el.value; render(); }
});
document.addEventListener("change", (e) => {
  const el = e.target as HTMLSelectElement;
  if (el.id === "scope") { state.scope = el.value; render(); }
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const el = document.getElementById("ask") as HTMLInputElement | null;
  if (el) { const v = el.value; el.value = ""; ask(v); }
});
setInterval(() => { const el = document.getElementById("live"); if (el) el.innerHTML = live(); }, 3000);
render();
