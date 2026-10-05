import { NextResponse } from "next/server";
import { dataDir } from "@/lib/store/store";
import { sessionSecretConfigured } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    backend: "file",
    dataDir: dataDir(),
    auth: "demo (signierte Sessions, HMAC-SHA256)",
    sessionSecretConfigured: sessionSecretConfigured(),
    edgeTokenConfigured: !!process.env.PLANTOS_EDGE_TOKEN,
    llm: "lokal-regelbasiert (kein Cloud-LLM)",
    writeAccess: "keiner – SPS nur Lesen",
  });
}
