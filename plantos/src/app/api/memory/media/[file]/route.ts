import { NextResponse } from "next/server";
import { requireCap } from "@/lib/auth/server";
import { readMedia } from "@/lib/memory/store";

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const auth = await requireCap("read");
  if ("response" in auth) return auth.response;
  const { file } = await params;
  const buf = await readMedia(auth.session.tenant, file);
  if (!buf) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  const type = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}
