"use client";

import type { ReactNode } from "react";

/** Tabs ohne Hover-Abhängigkeit, horizontal scrollbar auf dem iPhone. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-hairline px-1" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`focus-ring -mb-px min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-[13px] sm:min-h-9 ${value === t.id ? "border-accent text-foreground" : "border-transparent text-muted"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
