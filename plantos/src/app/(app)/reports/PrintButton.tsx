"use client";

export function PrintButton() {
  return <button onClick={() => window.print()} className="no-print focus-ring inline-flex min-h-11 items-center rounded-md border border-border bg-surface-elevated px-3 text-[13px] sm:min-h-8">Drucken / PDF</button>;
}
