"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { StabilitySim } from "./StabilitySim";
import { LineSim } from "./LineSim";

export default function SimulationPage() {
  const [tab, setTab] = useState<"line" | "stability">("line");
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader eyebrow="Analyse" title="Simulation" subtitle="Modell, kein Produktionszustand · jede Größe als Messwert, Modellwert, Annahme oder Simulation gekennzeichnet" />
      <Tabs tabs={[{ id: "line", label: "Linie: Antrieb, Puffer, Durchsatz, Energie" }, { id: "stability", label: "Produktstabilität (Kippen)" }]} value={tab} onChange={setTab} />
      {tab === "line" ? <LineSim /> : <StabilitySim />}
    </div>
  );
}
