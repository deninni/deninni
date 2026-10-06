import { NextResponse } from "next/server";
import { WRITE_GUARD_HONESTY } from "@/lib/brand";

/** Schreibschutz: plantOS schreibt NIE in eine SPS. Antwort immer 403. */
function deny() {
  return NextResponse.json({ error: "Schreibzugriff verweigert", detail: WRITE_GUARD_HONESTY }, { status: 403 });
}
export const GET = deny;
export const POST = deny;
export const PUT = deny;
export const PATCH = deny;
export const DELETE = deny;
