import "server-only";
import { NextResponse } from "next/server";

/** Einheitliche Fehlerbehandlung für Route-Handler (fachliche Fehler mit status, Rest 500 ohne Details). */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status && err.status >= 400 && err.status < 500) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err.name === "GraphError" || err.name === "MemoryError" || err.constructor?.name === "GraphError" || err.constructor?.name === "MemoryError") return NextResponse.json({ error: err.message }, { status: err.status ?? 400 });
    console.error("[plantOS] API-Fehler", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 4 * 1024 * 1024) throw Object.assign(new Error("Anfrage zu groß"), { status: 413 });
  try {
    return (await req.json()) as T;
  } catch {
    throw Object.assign(new Error("Ungültiges JSON"), { status: 400 });
  }
}
