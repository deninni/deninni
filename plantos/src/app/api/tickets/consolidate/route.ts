import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { mutateStore } from "@/lib/store/store";
import { consolidate } from "@/lib/tickets/dedupe";
import { audit } from "@/lib/audit";

export async function POST() {
  const auth = await requireRole("operator");
  if ("response" in auth) return auth.response;
  const r = await mutateStore((s) => consolidate(s.tickets));
  await audit({ actor: auth.session.sub, action: "ticket.consolidate", detail: `${r.merged} zusammengeführt` });
  return NextResponse.json(r);
}
