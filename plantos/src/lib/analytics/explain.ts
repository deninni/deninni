/**
 * Explainable AI: einheitliches Erklärungsobjekt für jede Diagnose, Prognose oder Empfehlung.
 * Keine Blackbox – jede Aussage nennt Daten, Zeitraum, Begründung, Confidence, Alternativen und Lücken.
 */
export type ConfidenceLabel = "hoch" | "mittel" | "niedrig";

export interface Explanation {
  method: string;
  usedData: { signal: string; source: string; samples: number; note?: string }[];
  period: { from: string; to: string };
  reasoning: string[];
  confidence: { score: number; label: ConfidenceLabel; why: string };
  alternatives: string[];
  missingData: string[];
  similarCases: { title: string; similarityPct: number; plant: string; assetId: string; memoryId: string }[];
  nextCheck: string;
}

export function confidenceLabel(score: number): ConfidenceLabel {
  return score >= 0.75 ? "hoch" : score >= 0.5 ? "mittel" : "niedrig";
}
