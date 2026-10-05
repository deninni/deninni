"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("demo@plantos.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Anmeldung fehlgeschlagen");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="label-section">E-Mail</span>
        <input className="input-industrial mt-1 w-full" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="block">
        <span className="label-section">Passwort</span>
        <input className="input-industrial mt-1 w-full" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      </label>
      {error && <div role="alert" className="rounded-md border border-status-fault/40 bg-status-fault/10 px-3 py-2 text-[12px] text-status-fault">{error}</div>}
      <button disabled={busy} className="focus-ring min-h-11 w-full rounded-md bg-accent text-[13px] font-medium text-white transition-colors hover:bg-accent/85 disabled:opacity-60">
        {busy ? "Anmelden …" : "Anmelden"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled title="SSO (Entra ID / Google) vorbereitet – nicht konfiguriert" className="min-h-9 rounded-md border border-border text-[12px] text-muted opacity-50">Microsoft SSO</button>
        <button type="button" disabled title="SSO vorbereitet – nicht konfiguriert" className="min-h-9 rounded-md border border-border text-[12px] text-muted opacity-50">Google SSO</button>
      </div>
      <p className="text-[10px] text-stainless-dim">SSO ist für Enterprise-Piloten vorgesehen, aber noch nicht konfiguriert.</p>
    </form>
  );
}
