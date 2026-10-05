"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Polling mit Pause bei verstecktem Tab und Abbruch veralteter Requests. */
export function usePoll<T>(url: string | null, intervalMs: number): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!url) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    try {
      const r = await fetch(url, { signal: c.signal, cache: "no-store" });
      if (r.status === 401) { window.location.href = "/login"; return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    }
  }, [url]);

  useEffect(() => {
    setData(null);
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, intervalMs);
    return () => { clearInterval(id); ctrl.current?.abort(); };
  }, [load, intervalMs]);

  return { data, error, reload: load };
}

export async function postJson<T = unknown>(url: string, body: unknown, method = "POST"): Promise<T> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  return j as T;
}
