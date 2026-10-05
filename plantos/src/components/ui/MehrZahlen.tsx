import type { ReactNode } from "react";

/** Ruhige Seiten: Zusatzzahlen liegen standardmäßig eingeklappt hinter „mehr Zahlen“. */
export function MehrZahlen({ children, label = "mehr Zahlen" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group mt-3 rounded-md border border-hairline">
      <summary className="focus-ring select-none px-3 py-2 text-[12px] text-muted hover:text-foreground">
        <span className="inline-block transition-transform group-open:rotate-90">▸</span> {label}
      </summary>
      <div className="border-t border-hairline p-3">{children}</div>
    </details>
  );
}
