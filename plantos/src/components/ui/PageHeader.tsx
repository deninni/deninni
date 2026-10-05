import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, subtitle, actions, gradient }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode; gradient?: string }) {
  if (gradient) {
    return (
      <div className="relative -mx-4 -mt-4 mb-6 overflow-hidden sm:-mx-6 sm:-mt-6" style={{ minHeight: 200 }}>
        <div className="absolute inset-0" style={{ background: gradient }} />
        <div className="absolute inset-0 industrial-grid opacity-60" />
        <div className="absolute inset-0 photo-fade-b" />
        <div className="relative flex min-h-[200px] items-end justify-between gap-4 px-4 pb-5 sm:min-h-[230px] sm:px-6">
          <div>
            {eyebrow && <div className="label-section mb-1 text-white/60">{eyebrow}</div>}
            <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-white/70">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="label-section mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
