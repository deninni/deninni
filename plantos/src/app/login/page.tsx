import { Factory } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return (
    <div className="login-backdrop relative grid min-h-dvh place-items-center px-4">
      <div className="industrial-grid absolute inset-0 opacity-40" />
      <div className="login-frost relative w-full max-w-sm rounded-xl p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md border border-accent-border bg-accent-muted text-accent">
            <Factory size={18} />
          </span>
          <div>
            <div className="text-lg font-semibold tracking-tight">Willkommen bei plant<span className="text-accent">OS</span></div>
            <div className="text-[12px] text-muted">Industrial AI · Abfüllung &amp; Verpackung</div>
          </div>
        </div>
        <LoginForm next={safeNext} />
        <div className="mt-5 rounded-md border border-hairline bg-navy-deep/60 p-3 text-[11px] leading-relaxed text-muted">
          <div className="label-section mb-1">Demo-Zugänge</div>
          {[
            ["demo@plantos.local", "plantos-demo", "Admin"],
            ["werkleiter@plantos.local", "plantos-werkleiter", "Werkleiter"],
            ["instandhaltung@plantos.local", "plantos-instandhaltung", "Instandhalter"],
            ["schicht@plantos.local", "plantos-schicht", "Operator"],
            ["viewer@plantos.local", "plantos-viewer", "Viewer"],
            ["admin@acme.test", "plantos-acme", "2. Mandant (Isolation)"],
          ].map(([u, p, r]) => <div key={u}><span className="font-mono text-stainless">{u}</span> / {p} · {r}</div>)}
        </div>
        <p className="mt-4 text-center text-[10px] text-stainless-dim">© plantOS · READ ONLY · Kein Produktionszugriff</p>
      </div>
    </div>
  );
}
