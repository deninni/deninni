export type MachineId = "m-af12" | "m-vl3" | "m-ft7";

export interface MachineDef {
  id: MachineId;
  code: string;
  name: string;
  kind: string;
  line: string;
  nominalRate: number; // Einheiten / min bei 100 %
  unit: string;
  description: string;
  gradient: string; // CSS-Gradient für Header (kein Stockfoto im Repo)
}

export const MACHINES: MachineDef[] = [
  {
    id: "m-af12",
    code: "AF-12",
    name: "Abfüllanlage AF-12",
    kind: "Abfüllung PET",
    line: "Linie A",
    nominalRate: 600,
    unit: "Fl/min",
    description: "Einlauf → Spüler → Füller (12 Ventile) → Verschließer → Etikettierer → Packer",
    gradient: "linear-gradient(135deg,#15324a 0%,#0e1c2a 55%,#0a0e14 100%)",
  },
  {
    id: "m-vl3",
    code: "VL-3",
    name: "Verpackungslinie VL-3",
    kind: "Verpackung / Shrink",
    line: "Linie A",
    nominalRate: 80,
    unit: "Gebinde/min",
    description: "Zuführung → Folienwickler → Shrink-Tunnel → Auslauf",
    gradient: "linear-gradient(135deg,#3a2a1a 0%,#1c1712 55%,#0a0e14 100%)",
  },
  {
    id: "m-ft7",
    code: "FT-7",
    name: "Fördertechnik FT-7",
    kind: "Fördertechnik · Retrofit",
    line: "Linie B",
    nominalRate: 120,
    unit: "Gebinde/min",
    description: "Segment A → Segment B (Sorter) → Segment C · Bestandsanlage",
    gradient: "linear-gradient(135deg,#22303a 0%,#141b22 55%,#0a0e14 100%)",
  },
];

export function getMachine(id: string): MachineDef | undefined {
  return MACHINES.find((m) => m.id === id || m.code.toLowerCase() === id.toLowerCase());
}

export function isMachineId(id: string): id is MachineId {
  return MACHINES.some((m) => m.id === id);
}
