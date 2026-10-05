import type { ReactNode } from "react";

export function Card({ title, action, children, className = "", padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
          {title && <h2 className="label-section">{title}</h2>}
          {action}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}
