// =============================================================================
// DELETE /api/history/[id]   → elimina una minuta del historial compartido
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getRedis, HISTORY_KEY } from "@/lib/kv";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ configured: false, ok: false });
  }
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  try {
    await redis.hdel(HISTORY_KEY, id);
    return NextResponse.json({ configured: true, ok: true });
  } catch (e: any) {
    console.error("history DELETE error:", e);
    return NextResponse.json(
      { error: "Error eliminando del historial: " + (e.message || e) },
      { status: 502 }
    );
  }
}
