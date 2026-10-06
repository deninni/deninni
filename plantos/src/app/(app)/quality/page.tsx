"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { QualityPanel } from "@/components/brain/QualityPanel";
import { MachinePicker } from "@/components/brain/MachinePicker";

export default function QualityPage() {
  const [id, setId] = useState("m-af12");
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader eyebrow="Analyse" title="Quality AI" subtitle="Ausschuss ↔ Geschwindigkeit, Druck, Temperatur, Produkt, Schicht · Korrelation, keine automatische Prozessänderung" actions={<MachinePicker value={id} onChange={setId} />} />
      <QualityPanel assetId={id} />
    </div>
  );
}
