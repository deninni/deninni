import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { sanitizeInput, simulateLine, DEFAULT_INPUT, type SimInput } from "@/lib/simulation/line";
import { getBrain } from "@/lib/server/brain";
import { assetSnapshot } from "@/lib/assets/telemetry";
import { MAX_LINE_SPEED_MS } from "@/lib/twin/physics";
import { handle, body } from "@/lib/server/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Vorbelegung: aktuelle Messwerte der gewählten Maschine (gekennzeichnet als Messwert). */
export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireCap("read");
    if ("response" in auth) return auth.response;
    const b = await getBrain(auth.session.tenant);
    const id = new URL(req.url).searchParams.get("assetId") ?? "m-af12";
    const m = b.g.node(id);
    const input: SimInput = { ...DEFAULT_INPUT };
    const measured: Partial<Record<keyof SimInput, boolean>> = {};
    if (m?.type === "machine") {
      const s = assetSnapshot(m);
      input.beltSpeedMs = Math.round(((MAX_LINE_SPEED_MS * s.signals.speedPercent) / 100) * 100) / 100;
      measured.beltSpeedMs = true;
    }
    return NextResponse.json({ input, measured, result: simulateLine(input, measured), source: "DEMO" });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireCap("simulation.run");
    if ("response" in auth) return auth.response;
    const raw = await body<{ input?: Record<string, unknown>; assetId?: string }>(req);
    const input = sanitizeInput(raw.input ?? {});
    // „Messwert“ nur, wenn der Eingabewert dem aktuellen Messwert der Maschine entspricht (serverseitig geprüft)
    const measured: Partial<Record<keyof SimInput, boolean>> = {};
    const b = await getBrain(auth.session.tenant);
    const m = raw.assetId ? b.g.node(raw.assetId) : null;
    if (m?.type === "machine") {
      const v = Math.round(((MAX_LINE_SPEED_MS * assetSnapshot(m).signals.speedPercent) / 100) * 100) / 100;
      if (Math.abs(v - input.beltSpeedMs) <= 0.02) measured.beltSpeedMs = true;
    }
    const result = simulateLine(input, measured);
    await audit({ tenant: auth.session.tenant, actor: auth.session.sub, action: "simulation.run", detail: `v=${input.beltSpeedMs} m/s, Format ${input.bottleFormat}, Durchsatz ${result.outputs.throughput.value}/h` });
    return NextResponse.json({ input, result });
  });
}
