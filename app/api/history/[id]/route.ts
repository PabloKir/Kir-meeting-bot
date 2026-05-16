// =============================================================================
// DELETE /api/history/[id]   → elimina una minuta del historial compartido
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getRedis, HISTORY_KEY } from "@/lib/kv";
import { masterKey, verifyMasterKey } from "@/lib/server-crypto";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Gate de borrado: si hay MASTER_KEY configurada, exigir clave valida.
  if (masterKey()) {
    const key =
      req.headers.get("x-master-key") ||
      new URL(req.url).searchParams.get("key") ||
      "";
    if (!verifyMasterKey(key)) {
      return NextResponse.json(
        { error: "Clave maestra requerida o incorrecta para eliminar." },
        { status: 403 }
      );
    }
  }
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
