"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Server-Komponenten neu laden (Intervall + Button „Aktualisieren“). */
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState<string>("");
  useEffect(() => {
    setAt(new Date().toLocaleTimeString("de-DE"));
    const id = setInterval(() => {
      if (!document.hidden) start(() => { router.refresh(); setAt(new Date().toLocaleTimeString("de-DE")); });
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return (
    <button
      onClick={() => start(() => { router.refresh(); setAt(new Date().toLocaleTimeString("de-DE")); })}
      className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-md border border-white/15 bg-black/25 px-3 text-[12px] text-white/85 backdrop-blur hover:bg-black/40 sm:min-h-8"
      title={at ? `Stand ${at}` : undefined}
    >
      <RefreshCw size={13} className={pending ? "animate-spin" : ""} /> Aktualisieren
    </button>
  );
}
