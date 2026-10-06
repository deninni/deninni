import type { MachineId } from "../plants";

export type NodeKind = "conveyor" | "starwheel" | "station" | "motor" | "sensor" | "valve" | "pump" | "safety" | "tunnel" | "gear";

export interface TwinNode {
  id: string;
  label: string; // „Kurzname · Zusatz“ – 3D zeigt nur den Kurznamen
  kind: NodeKind;
  x: number; // 2D-Schema in Prozent
  y: number;
  plcTag?: string;
  plcAddress?: string;
}

export interface TwinLayout {
  machineId: MachineId;
  nodes: TwinNode[];
  flow: string[]; // Materialfluss-Reihenfolge
}

export const LAYOUTS: Record<MachineId, TwinLayout> = {
  "m-af12": {
    machineId: "m-af12",
    flow: ["b-101", "sr-01", "rn-01", "sr-02", "fc-01", "sr-03", "cp-01", "lb-01", "b-102", "pk-01"],
    nodes: [
      { id: "b-101", label: "Einlauf B-101", kind: "conveyor", x: 6, y: 50 },
      { id: "sr-01", label: "Sternrad SR-01", kind: "starwheel", x: 16, y: 50 },
      { id: "rn-01", label: "Spüler RN-01 · Drehturm", kind: "station", x: 26, y: 50 },
      { id: "sr-02", label: "Sternrad SR-02", kind: "starwheel", x: 36, y: 50 },
      { id: "fc-01", label: "Füller FC-01 · 12 Ventile", kind: "station", x: 48, y: 50 },
      { id: "sr-03", label: "Sternrad SR-03", kind: "starwheel", x: 60, y: 50 },
      { id: "cp-01", label: "Verschließer CP-01", kind: "station", x: 69, y: 50 },
      { id: "lb-01", label: "Etikettierer LB-01", kind: "station", x: 78, y: 50 },
      { id: "rj-01", label: "Ausschleuser RJ-01", kind: "station", x: 84, y: 72 },
      { id: "b-102", label: "Auslauf B-102", kind: "conveyor", x: 87, y: 50 },
      { id: "pk-01", label: "Packer PK-01", kind: "station", x: 95, y: 50 },
      { id: "m-001", label: "Hauptantrieb M-001", kind: "motor", x: 52, y: 88, plcTag: "M1", plcAddress: "DB10.DBD4" },
      { id: "p-2", label: "Pumpe P2", kind: "pump", x: 42, y: 88, plcTag: "P2", plcAddress: "DB10.DBD12" },
      { id: "fv-01", label: "Füllventil FV-01", kind: "valve", x: 48, y: 22, plcTag: "FV-01", plcAddress: "DB10.DBX0.0" },
      { id: "ls-17", label: "Lichtschranke LS-17", kind: "sensor", x: 62, y: 26, plcTag: "B1", plcAddress: "I 2.1" },
      { id: "s-speed", label: "Drehzahl S-202", kind: "sensor", x: 56, y: 80, plcTag: "S-202", plcAddress: "DB10.DBD8" },
      { id: "tt-214", label: "Temperatur TT-214", kind: "sensor", x: 44, y: 24, plcTag: "TT-214", plcAddress: "DB10.DBD16" },
      { id: "e-stop", label: "Not-Aus", kind: "safety", x: 96, y: 82 },
    ],
  },
  "m-vl3": {
    machineId: "m-vl3",
    flow: ["vl-in", "vl-wrap", "vl-tunnel", "vl-out"],
    nodes: [
      { id: "vl-in", label: "Zuführung", kind: "conveyor", x: 12, y: 50 },
      { id: "vl-wrap", label: "Folienwickler", kind: "station", x: 36, y: 50 },
      { id: "vl-tunnel", label: "Shrink-Tunnel", kind: "tunnel", x: 60, y: 50, plcTag: "PT100", plcAddress: "DB20.DBD0" },
      { id: "vl-out", label: "Auslauf", kind: "conveyor", x: 86, y: 50 },
      { id: "vl-gear", label: "Getriebe G1", kind: "gear", x: 36, y: 82 },
      { id: "vl-motor", label: "Motor M1", kind: "motor", x: 26, y: 82, plcTag: "M1", plcAddress: "DB20.DBD4" },
      { id: "vl-enc", label: "Encoder", kind: "sensor", x: 20, y: 24, plcTag: "ENC", plcAddress: "DB20.DBD8" },
      { id: "vl-l1", label: "Lichtgitter L1", kind: "sensor", x: 78, y: 24, plcTag: "L1", plcAddress: "I 1.0" },
    ],
  },
  "m-ft7": {
    machineId: "m-ft7",
    flow: ["ft-seg-a", "ft-seg-b", "ft-seg-c"],
    nodes: [
      { id: "ft-seg-a", label: "Segment A", kind: "conveyor", x: 18, y: 45 },
      { id: "ft-seg-b", label: "Segment B · Sorter", kind: "conveyor", x: 50, y: 45 },
      { id: "ft-seg-c", label: "Segment C", kind: "conveyor", x: 82, y: 45 },
      { id: "ft-m-a", label: "Motor A1", kind: "motor", x: 18, y: 80, plcTag: "M1", plcAddress: "DB30.DBD0" },
      { id: "ft-m-b", label: "Antrieb A3", kind: "motor", x: 50, y: 80, plcTag: "M3", plcAddress: "DB30.DBD4" },
      { id: "ft-m-c", label: "Motor C1", kind: "motor", x: 82, y: 80, plcTag: "M5", plcAddress: "DB30.DBD8" },
      { id: "ft-ls1", label: "LS-1", kind: "sensor", x: 34, y: 18, plcTag: "B1", plcAddress: "I 0.1" },
      { id: "ft-ls2", label: "LS-2", kind: "sensor", x: 66, y: 18, plcTag: "B2", plcAddress: "I 0.2" },
    ],
  },
};

export function shortComponentLabel(label: string): string {
  const s = label.split("·")[0].trim();
  return s.length > 18 ? s.slice(0, 17) + "…" : s;
}
