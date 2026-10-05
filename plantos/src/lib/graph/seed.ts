import type { GraphDoc, GraphEdge, GraphNode, NodeType, EdgeType, MachineProps, SparePartProps } from "./model";
import { LAYOUTS } from "../twin/layouts";

/**
 * Demo-Konzernstruktur (DEMO – keine realen Kundendaten).
 * Deterministisch: gleiche IDs bei jedem Seed, damit Tests und Verweise stabil sind.
 */

interface Ctx { nodes: GraphNode[]; edges: GraphEdge[]; at: string }

function N(c: Ctx, id: string, type: NodeType, name: string, code?: string, props: Record<string, unknown> = {}): string {
  c.nodes.push({ id, type, name, code, props, source: "demo", createdAt: c.at });
  return id;
}
function E(c: Ctx, from: string, type: EdgeType, to: string) {
  c.edges.push({ id: `e:${from}:${type}:${to}`, from, to, type, source: "demo", createdAt: c.at });
}
function child(c: Ctx, parent: string, id: string, type: NodeType, name: string, code?: string, props: Record<string, unknown> = {}) {
  N(c, id, type, name, code, props);
  E(c, id, "partOf", parent);
  return id;
}

const MATERIALS: Record<string, { name: string; unitCost: number; failureModes: string[] }> = {
  "4711": { name: "Rillenkugellager 6205-2RS", unitCost: 38, failureModes: ["Lagerschaden", "Vibration"] },
  "4712": { name: "Dichtungssatz Füllventil", unitCost: 145, failureModes: ["Undichtigkeit", "Füllmenge"] },
  "4713": { name: "Drehstrommotor 7,5 kW IE3", unitCost: 1890, failureModes: ["Wicklungsschaden", "Übertemperatur"] },
  "4714": { name: "Getriebemotor 2,2 kW", unitCost: 1240, failureModes: ["Getriebeschaden", "Übertemperatur", "Stromspitze"] },
  "4720": { name: "Fördergurt Modulband 600 mm", unitCost: 980, failureModes: ["Gurtverschleiß", "Stau"] },
  "4730": { name: "Heizregister Shrink-Tunnel", unitCost: 2150, failureModes: ["Übertemperatur", "Heizungsausfall"] },
  "4731": { name: "Umluftventilator Tunnel", unitCost: 640, failureModes: ["Vibration", "Übertemperatur"] },
};

interface MachineDefSeed {
  id: string;
  code: string;
  name: string;
  props: MachineProps;
  motorCode: string;
  plcCode: string;
  db: number;
  /** Erster freier Tag-Index (Bestandsanlagen: Layout-Tags belegen niedrige Adressen) */
  tagStart?: number;
  twinMotor?: string;
}

function sparePart(c: Ctx, plantId: string, plantCode: string, material: string, stock: number, minStock: number, leadTimeDays: number) {
  const id = `sp-${plantCode}-${material}`;
  if (c.nodes.some((n) => n.id === id)) return id;
  const m = MATERIALS[material];
  const props: SparePartProps = { sapMaterial: material, stock, minStock, leadTimeDays, unitCost: m.unitCost, failureModes: m.failureModes };
  N(c, id, "sparePart", m.name, material, { ...props, plant: plantId });
  E(c, id, "material", `mat-${material}`);
  return id;
}

/** Komponenten/Sensoren/Tags/SAP je Maschine nach Profil. */
function machine(c: Ctx, lineId: string, plantId: string, plantCode: string, fl: string, d: MachineDefSeed, stock: Record<string, [number, number, number]>) {
  const m = child(c, lineId, d.id, "machine", d.name, d.code, d.props as unknown as Record<string, unknown>);
  const plc = N(c, `${d.id}-plc`, "plc", `SPS ${d.plcCode}`, d.plcCode, { vendor: "Siemens", family: d.props.profile === "m-ft7" ? "S7-1200" : "S7-1500", access: "read-only" });
  E(c, m, "controlledBy", plc);
  const eq = N(c, `${d.id}-eq`, "sapEquipment", `Equipment ${d.code}`, `EQ-${d.code.replace(/\W/g, "")}`, { sapSystem: "DEMO" });
  E(c, m, "sapEquipment", eq);
  E(c, m, "sapLocation", fl);

  const sp = (mat: string) => sparePart(c, plantId, plantCode, mat, ...(stock[mat] ?? [3, 1, 7]));
  let tagN = d.tagStart ?? 0;
  const tag = (owner: string, label: string, dataType = "REAL", bit = false) => {
    const addr = bit ? `DB${d.db}.DBX${tagN}.0` : `DB${d.db}.DBD${4 * tagN}`;
    tagN++;
    const t = N(c, `${owner}-tag`, "plcTag", `${label}`, addr, { address: addr, dataType, plc: d.plcCode, access: "read" });
    E(c, t, "tagOf", plc);
    E(c, owner, "measuredBy", t);
    return t;
  };

  const drive = child(c, m, `${d.id}-asm-drive`, "assembly", d.props.profile === "m-ft7" ? "Antriebsstation" : "Hauptantrieb", undefined);
  const motor = child(c, drive, `${d.id}-motor`, "component", `Motor ${d.motorCode}`, d.motorCode, { kind: "motor", ratedCurrentA: d.props.ratedCurrentA, ...(d.twinMotor ? { twinNode: d.twinMotor } : {}) });
  E(c, motor, "controlledBy", plc);
  const meq = N(c, `${d.id}-motor-eq`, "sapEquipment", `Equipment Motor ${d.motorCode}`, `EQ-${d.code.replace(/\W/g, "")}-${d.motorCode.replace(/\W/g, "")}`, { sapSystem: "DEMO" });
  E(c, motor, "sapEquipment", meq);
  tag(motor, `${d.motorCode} Motorstrom`);
  const bearing = child(c, drive, `${d.id}-bearing`, "component", "Motorlager AS", undefined, { kind: "bearing" });
  E(c, bearing, "usesSparePart", sp("4711"));
  const vs = child(c, motor, `${d.id}-vs`, "sensor", `Schwingung ${d.motorCode}`, `VS-${d.motorCode}`, { kind: "vibration", unit: "mm/s", signal: "vibrationMmS" });
  tag(vs, `VS-${d.motorCode} Schwingung`);
  const ts = child(c, motor, `${d.id}-ts`, "sensor", `Temperatur ${d.motorCode}`, `TT-${d.motorCode}`, { kind: "temperature", unit: "°C", signal: "temperatureC" });
  tag(ts, `TT-${d.motorCode} Temperatur`);

  if (d.props.profile === "m-af12") {
    E(c, motor, "usesSparePart", sp("4713"));
    const filler = child(c, m, `${d.id}-asm-filler`, "assembly", "Füllerkarussell", undefined);
    const valves = child(c, filler, `${d.id}-valves`, "component", "Füllventile (12×)", undefined, { kind: "valve" });
    E(c, valves, "usesSparePart", sp("4712"));
    const fv = child(c, valves, `${d.id}-fv`, "actuator", "Füllventil-Ansteuerung", "FV-01", { kind: "valve", access: "read-only (Status)" });
    tag(fv, "FV-01 Status", "BOOL", true);
    const pt = child(c, filler, `${d.id}-pt`, "sensor", "Fülldruck", "PT-F", { kind: "pressure", unit: "bar", signal: "pressureBar" });
    tag(pt, "PT-F Fülldruck");
  } else if (d.props.profile === "m-vl3") {
    E(c, motor, "usesSparePart", sp("4714"));
    const tunnel = child(c, m, `${d.id}-asm-tunnel`, "assembly", "Shrink-Tunnel", undefined);
    const heater = child(c, tunnel, `${d.id}-heater`, "component", "Heizregister", "HZ-1", { kind: "heater" });
    E(c, heater, "usesSparePart", sp("4730"));
    const fan = child(c, tunnel, `${d.id}-fan`, "component", "Umluftventilator", "LV-1", { kind: "fan" });
    E(c, fan, "usesSparePart", sp("4731"));
    const pt100 = child(c, tunnel, `${d.id}-pt100`, "sensor", "Tunneltemperatur PT100", "PT100", { kind: "temperature", unit: "°C", signal: "temperatureC" });
    tag(pt100, "PT100 Tunneltemperatur");
  } else {
    E(c, motor, "usesSparePart", sp("4714"));
    const belt = child(c, m, `${d.id}-asm-belt`, "assembly", "Fördergurt", undefined);
    const gurt = child(c, belt, `${d.id}-gurt`, "component", "Modulband", undefined, { kind: "belt" });
    E(c, gurt, "usesSparePart", sp("4720"));
    const ls = child(c, belt, `${d.id}-ls`, "sensor", "Lichtschranke Stau", "LS-1", { kind: "presence", signal: null });
    tag(ls, "LS-1 Stau", "BOOL", true);
  }

  for (const [suffix, title, kind] of [["ba", "Betriebsanleitung", "manual"], ["sp", "Schaltplan", "schematic"], ["wp", "Wartungsplan", "maintenance-plan"]] as const) {
    const doc = N(c, `${d.id}-doc-${suffix}`, "document", `${title} ${d.code}`, undefined, { kind, note: "DEMO-Metadaten · kein Dokumentinhalt hinterlegt" });
    E(c, doc, "documents", m);
  }
  return m;
}

/** Werk-Nord-Bestandsanlagen: Komponenten aus dem Twin-Layout übernehmen (gleiche IDs wie Live/Twin). */
const LEGACY_MOTOR: Record<string, string> = { "m-af12": "m-001", "m-vl3": "vl-motor", "m-ft7": "ft-m-b" };

function legacyLayout(c: Ctx, machineId: "m-af12" | "m-vl3" | "m-ft7") {
  const plc = `${machineId}-plc`;
  for (const n of LAYOUTS[machineId].nodes) {
    if (LEGACY_MOTOR[machineId] === n.id) continue; // Hauptmotor existiert bereits als Komponente (mit SAP/Ersatzteil)
    const id = `${machineId}/${n.id}`;
    if (c.nodes.some((x) => x.id === id)) continue;
    const type: NodeType = n.kind === "sensor" ? "sensor" : n.kind === "valve" ? "actuator" : "component";
    child(c, machineId, id, type, n.label.split("·")[0].trim(), n.id.toUpperCase(), { kind: n.kind, twinNode: n.id });
    if (n.plcTag && n.plcAddress) {
      const t = N(c, `${id}-tag`, "plcTag", `${n.plcTag}`, n.plcAddress, { address: n.plcAddress, plc: plc, access: "read", fromLayout: true });
      E(c, t, "tagOf", plc);
      E(c, id, "measuredBy", t);
    }
  }
}

export function buildDemoGraph(tenant: string, now = Date.now()): GraphDoc {
  const c: Ctx = { nodes: [], edges: [], at: new Date(now).toISOString() };
  for (const [mat, m] of Object.entries(MATERIALS)) N(c, `mat-${mat}`, "sapMaterial", m.name, mat, { sapSystem: "DEMO", unitCost: m.unitCost });

  if (tenant === "acme") {
    const co = N(c, "acme-co", "company", "ACME Test GmbH (DEMO)", "ACME");
    const reg = child(c, co, "acme-reg", "region", "EMEA", "EMEA");
    const cty = child(c, reg, "acme-de", "country", "Deutschland", "DE");
    const site = child(c, cty, "acme-site", "site", "Standort Köln", "KOE");
    const plant = child(c, site, "acme-pl1", "plant", "ACME Werk 1", "W1", { timezone: "Europe/Berlin", technicians: 2, maintenanceWindows: [{ weekday: 6, startH: 6, durH: 6 }] });
    const area = child(c, plant, "acme-area", "area", "Logistik", "LOG");
    const line = child(c, area, "acme-l1", "line", "Linie 1", "L1");
    const fl = N(c, "acme-fl-l1", "sapFunctionalLocation", "TP ACME-W1-L1", "ACME-W1-L1");
    E(c, line, "sapLocation", fl);
    machine(c, line, plant, "acme1", fl, { id: "acme-ft1", code: "FT-1", name: "Fördertechnik FT-1", props: { profile: "m-ft7", offsetMin: 777, driftPhaseDays: 10, ratedCurrentA: 12, nominalRate: 120, unit: "Gebinde/min", maintenanceIntervalH: 3000 }, motorCode: "M1", plcCode: "PLC-A1", db: 40 }, {});
    return { version: 1, tenant, seededAt: c.at, nodes: c.nodes, edges: c.edges };
  }

  const co = N(c, "co", "company", "Demo Beverages Group (DEMO)", "DBG", { demo: true });
  const emea = child(c, co, "reg-emea", "region", "EMEA", "EMEA");
  const na = child(c, co, "reg-na", "region", "Nordamerika", "NA");
  const de = child(c, emea, "cty-de", "country", "Deutschland", "DE");
  const pl = child(c, emea, "cty-pl", "country", "Polen", "PL");
  const us = child(c, na, "cty-us", "country", "USA", "US");

  type PlantSeed = { id: string; code: string; name: string; site: string; siteName: string; country: string; tz: string; technicians: number; windows: { weekday: number; startH: number; durH: number }[]; energyPrice?: number };
  const plantsSeed: PlantSeed[] = [
    { id: "pl-nord", code: "NORD", name: "Werk Nord", site: "site-ham", siteName: "Standort Hamburg", country: de, tz: "Europe/Berlin", technicians: 3, windows: [{ weekday: 6, startH: 6, durH: 8 }] },
    { id: "pl-sued", code: "SUED", name: "Werk Süd", site: "site-muc", siteName: "Standort München", country: de, tz: "Europe/Berlin", technicians: 2, windows: [{ weekday: 3, startH: 22, durH: 6 }, { weekday: 6, startH: 6, durH: 6 }] },
    { id: "pl-posen", code: "POZ", name: "Werk Posen", site: "site-poz", siteName: "Standort Poznań", country: pl, tz: "Europe/Warsaw", technicians: 2, windows: [{ weekday: 0, startH: 6, durH: 10 }] },
    { id: "pl-atl", code: "ATL", name: "Werk Atlanta", site: "site-atl", siteName: "Standort Atlanta", country: us, tz: "America/New_York", technicians: 4, windows: [{ weekday: 6, startH: 4, durH: 8 }] },
  ];
  const plantIds: Record<string, string> = {};
  for (const p of plantsSeed) {
    const site = child(c, p.country, p.site, "site", p.siteName, p.code);
    plantIds[p.code] = child(c, site, p.id, "plant", p.name, p.code, { timezone: p.tz, technicians: p.technicians, maintenanceWindows: p.windows, demo: true });
  }

  const area = (plant: string, code: string, name: string) => child(c, plant, `${plant}-${code.toLowerCase()}`, "area", name, code);
  const line = (areaId: string, plantCode: string, code: string, name: string) => {
    const id = child(c, areaId, `${areaId}-${code.toLowerCase()}`, "line", name, code);
    const fl = N(c, `${id}-fl`, "sapFunctionalLocation", `TP ${plantCode}-${code}`, `DE01-${plantCode}-${code}`, { sapSystem: "DEMO" });
    E(c, id, "sapLocation", fl);
    return { id, fl };
  };

  // Werk Nord – Bestandsanlagen (gleiche IDs wie Live/Twin/Meldungen)
  const nAbf = area(plantIds.NORD, "ABF", "Abfüllung");
  const nLog = area(plantIds.NORD, "LOG", "Logistik");
  const lA = line(nAbf, "NORD", "LA", "Linie A");
  const lB = line(nLog, "NORD", "LB", "Linie B");
  const nordStock: Record<string, [number, number, number]> = { "4711": [4, 2, 5], "4712": [6, 2, 10], "4713": [1, 1, 21], "4714": [1, 1, 14], "4720": [1, 1, 18], "4730": [0, 1, 28], "4731": [2, 1, 9] };
  machine(c, lA.id, plantIds.NORD, "nord", lA.fl, { id: "m-af12", code: "AF-12", name: "Abfüllanlage AF-12", props: { profile: "m-af12", legacyId: "m-af12", ratedCurrentA: 21, nominalRate: 600, unit: "Fl/min", maintenanceIntervalH: 2500 }, motorCode: "M-001", plcCode: "PLC-NA1", db: 10, tagStart: 10, twinMotor: "m-001" }, nordStock);
  machine(c, lA.id, plantIds.NORD, "nord", lA.fl, { id: "m-vl3", code: "VL-3", name: "Verpackungslinie VL-3", props: { profile: "m-vl3", legacyId: "m-vl3", ratedCurrentA: 14, nominalRate: 80, unit: "Gebinde/min", maintenanceIntervalH: 3000 }, motorCode: "M1", plcCode: "PLC-NA2", db: 20, tagStart: 10, twinMotor: "vl-motor" }, nordStock);
  machine(c, lB.id, plantIds.NORD, "nord", lB.fl, { id: "m-ft7", code: "FT-7", name: "Fördertechnik FT-7", props: { profile: "m-ft7", legacyId: "m-ft7", ratedCurrentA: 11, nominalRate: 120, unit: "Gebinde/min", maintenanceIntervalH: 3000 }, motorCode: "A3", plcCode: "PLC-NB1", db: 30, tagStart: 10, twinMotor: "ft-m-b" }, nordStock);
  legacyLayout(c, "m-af12");
  legacyLayout(c, "m-vl3");
  legacyLayout(c, "m-ft7");

  // Werk Süd – Beispiel aus der Anforderung: Motor M12 → FB03 → Linie 2, SPS PLC01, Tag DB12.DBD4, Material 4711
  const sAbf = area(plantIds.SUED, "ABF", "Abfüllung");
  const l2 = line(sAbf, "SUED", "L2", "Linie 2");
  const l4 = line(sAbf, "SUED", "L4", "Linie 4");
  const suedStock: Record<string, [number, number, number]> = { "4711": [0, 2, 12], "4712": [3, 2, 10], "4713": [0, 1, 25], "4714": [1, 1, 14], "4720": [2, 1, 18], "4730": [1, 1, 28], "4731": [0, 1, 9] };
  machine(c, l2.id, plantIds.SUED, "sued", l2.fl, { id: "m-sued-fb03", code: "FB03", name: "Förderband FB03", props: { profile: "m-ft7", offsetMin: 311, driftPhaseDays: 40, ratedCurrentA: 11, nominalRate: 120, unit: "Gebinde/min", maintenanceIntervalH: 3000 }, motorCode: "M12", plcCode: "PLC01", db: 12, tagStart: 1 }, suedStock);
  machine(c, l4.id, plantIds.SUED, "sued", l4.fl, { id: "m-sued-af24", code: "AF-24", name: "Abfüllanlage AF-24", props: { profile: "m-af12", offsetMin: 1013, driftPhaseDays: 63, ratedCurrentA: 21, nominalRate: 600, unit: "Fl/min", maintenanceIntervalH: 2500 }, motorCode: "M-241", plcCode: "PLC04", db: 14 }, suedStock);
  machine(c, l4.id, plantIds.SUED, "sued", l4.fl, { id: "m-sued-vl25", code: "VL-25", name: "Verpackung VL-25", props: { profile: "m-vl3", offsetMin: 523, driftPhaseDays: 0, ratedCurrentA: 14, nominalRate: 80, unit: "Gebinde/min", maintenanceIntervalH: 3000 }, motorCode: "M25", plcCode: "PLC05", db: 15 }, suedStock);

  // Werk Posen
  const pAbf = area(plantIds.POZ, "ABF", "Rozlewnia (Abfüllung)");
  const pl1 = line(pAbf, "POZ", "L1", "Linia 1");
  const pozStock: Record<string, [number, number, number]> = { "4711": [6, 2, 6], "4712": [2, 2, 10], "4713": [1, 1, 21], "4714": [2, 1, 14], "4730": [1, 1, 28], "4731": [1, 1, 9] };
  machine(c, pl1.id, plantIds.POZ, "poz", pl1.fl, { id: "m-poz-af31", code: "AF-31", name: "Abfüllanlage AF-31", props: { profile: "m-af12", offsetMin: 2017, driftPhaseDays: -20, ratedCurrentA: 21, nominalRate: 600, unit: "Fl/min", maintenanceIntervalH: 2500 }, motorCode: "M-311", plcCode: "PLC11", db: 31 }, pozStock);
  machine(c, pl1.id, plantIds.POZ, "poz", pl1.fl, { id: "m-poz-vl32", code: "VL-32", name: "Verpackung VL-32", props: { profile: "m-vl3", offsetMin: 1409, driftPhaseDays: 0, ratedCurrentA: 14, nominalRate: 80, unit: "Gebinde/min", maintenanceIntervalH: 3000 }, motorCode: "M32", plcCode: "PLC12", db: 32 }, pozStock);

  // Werk Atlanta
  const aFil = area(plantIds.ATL, "FIL", "Filling");
  const al1 = line(aFil, "ATL", "L1", "Line 1");
  const atlStock: Record<string, [number, number, number]> = { "4711": [8, 2, 4], "4712": [4, 2, 8], "4713": [2, 1, 14], "4714": [1, 1, 10], "4720": [1, 1, 12] };
  machine(c, al1.id, plantIds.ATL, "atl", al1.fl, { id: "m-atl-af41", code: "AF-41", name: "Filler AF-41", props: { profile: "m-af12", offsetMin: 3301, driftPhaseDays: 30, ratedCurrentA: 21, nominalRate: 600, unit: "btl/min", maintenanceIntervalH: 2500 }, motorCode: "M-411", plcCode: "PLC21", db: 41 }, atlStock);
  machine(c, al1.id, plantIds.ATL, "atl", al1.fl, { id: "m-atl-ft42", code: "FT-42", name: "Conveyor FT-42", props: { profile: "m-ft7", offsetMin: 2711, driftPhaseDays: 60, ratedCurrentA: 11, nominalRate: 120, unit: "cases/min", maintenanceIntervalH: 3000 }, motorCode: "M42", plcCode: "PLC22", db: 42 }, atlStock);

  return { version: 1, tenant, seededAt: c.at, nodes: c.nodes, edges: c.edges };
}
