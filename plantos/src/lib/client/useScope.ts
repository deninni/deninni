"use client";

import { useEffect, useState } from "react";

/** Schlüssel, der sich beim Werk-/Ebenenwechsel ändert (löst Neuladen von Client-Daten aus). */
export function useScopeKey(): string {
  const [k, setK] = useState("0");
  useEffect(() => {
    const f = (e: Event) => setK(String((e as CustomEvent).detail ?? Date.now()));
    window.addEventListener("plantos:scope", f);
    return () => window.removeEventListener("plantos:scope", f);
  }, []);
  return k;
}
