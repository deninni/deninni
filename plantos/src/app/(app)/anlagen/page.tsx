import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { MACHINES } from "@/lib/plants";
import { liveAll } from "@/lib/server/data";
import { kpis } from "@/lib/demo/engine";
import { de } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anlagen" };

export default async function AnlagenPage() {
  const snaps = await liveAll();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Werk Nord" title="Anlagen" subtitle="Demo-Werk Nord · drei verknüpfte Anlagen" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MACHINES.map((m) => {
          const s = snaps.find((x) => x.machineId === m.id)!;
          const k = kpis(m.id);
          return (
            <Link key={m.id} href={`/anlagen/${m.id}`} className="card focus-ring group overflow-hidden transition-colors hover:border-accent-border">
              <div className="relative h-32" style={{ background: m.gradient }}>
                <div className="industrial-grid absolute inset-0 opacity-60" />
                <div className="photo-fade-b absolute inset-0" />
                <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
                  <div>
                    <div className="text-[11px] text-white/60">{m.line} · {m.kind}</div>
                    <div className="text-lg font-semibold text-white">{m.code}</div>
                  </div>
                  <StatusPill state={s.state} />
                </div>
              </div>
              <div className="p-3">
                <div className="text-[13px] font-medium">{m.name}</div>
                <div className="mt-0.5 line-clamp-2 text-[12px] text-muted">{m.description}</div>
                <div className="mt-2 text-[12px] text-muted">OEE 8 h <span className="font-medium text-foreground tabular-nums">{de(k.oeePct)} %</span></div>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-4 text-[11px] text-stainless-dim">Weitere Anlagen werden über Connect (Edge-Agent + Symbolliste) angebunden. Header-Grafiken sind Platzhalter, keine Fotos der Kundenanlage.</p>
    </div>
  );
}
