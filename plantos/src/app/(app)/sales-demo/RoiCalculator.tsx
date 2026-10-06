"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { de } from "@/lib/format";

/** Beispielrechnung: Wert von OEE-Punkten. Alle Annahmen editierbar – keine Zusage. */
export function RoiCalculator() {
  const [lines, setLines] = useState(8);
  const [bpm, setBpm] = useState(600);
  const [hours, setHours] = useState(6000);
  const [margin, setMargin] = useState(0.04);
  const [oeeGain, setOeeGain] = useState(1.5);
  const [downtimeCost, setDowntimeCost] = useState(8000);
  const [stopsAvoided, setStopsAvoided] = useState(2);

  const extraUnits = lines * bpm * 60 * hours * (oeeGain / 100);
  const fromOee = extraUnits * margin;
  const fromStops = lines * stopsAvoided * 12 * downtimeCost;
  const total = fromOee + fromStops;

  const field = (label: string, v: number, set: (n: number) => void, step = 1, suffix = "") => (
    <label className="block text-[12px]">
      <span className="label-section">{label}</span>
      <div className="mt-1 flex items-center gap-1.5"><input type="number" step={step} value={v} onChange={(e) => set(Number(e.target.value) || 0)} className="input-industrial min-h-9 w-full tabular-nums" />{suffix && <span className="text-muted">{suffix}</span>}</div>
    </label>
  );

  return (
    <Card title="Wertbeitrag – Beispielrechnung">
      <div className="grid gap-3 sm:grid-cols-4">
        {field("Linien", lines, setLines)}
        {field("Einheiten / min / Linie", bpm, setBpm, 10)}
        {field("Betriebsstunden / Jahr", hours, setHours, 100)}
        {field("Deckungsbeitrag / Einheit", margin, setMargin, 0.005, "€")}
        {field("OEE-Gewinn", oeeGain, setOeeGain, 0.1, "Pkt.")}
        {field("Kosten je ungeplantem Stopp", downtimeCost, setDowntimeCost, 500, "€")}
        {field("vermiedene Stopps / Linie / Monat", stopsAvoided, setStopsAvoided, 0.5)}
      </div>
      <div className="kpi-strip mt-4">
        <div><div className="label-section">aus OEE</div><div className="mt-1 text-lg font-semibold tabular-nums">{de(fromOee / 1000, 0)} T€</div></div>
        <div><div className="label-section">aus Stopps</div><div className="mt-1 text-lg font-semibold tabular-nums">{de(fromStops / 1000, 0)} T€</div></div>
        <div><div className="label-section">pro Jahr</div><div className="mt-1 text-lg font-semibold tabular-nums text-accent">{de(total / 1_000_000, 2)} Mio €</div></div>
      </div>
      <p className="mt-3 text-[11px] text-stainless-dim">Beispielrechnung mit editierbaren Annahmen – keine Ertragszusage. Wird im Pilot mit echten Linien-Daten validiert.</p>
    </Card>
  );
}
