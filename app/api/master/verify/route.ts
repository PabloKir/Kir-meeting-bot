// POST /api/master/verify { key } → { ok } — gate de acciones sensibles (borrar)
import { NextRequest, NextResponse } from "next/server";
import { masterKey, verifyMasterKey } from "@/lib/server-crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!masterKey()) {
    // Sin MASTER_KEY configurada el gate esta deshabilitado.
    return NextResponse.json({ configured: false, ok: true });
  }
  let key = "";
  try {
    const body = await req.json();
    key = String(body?.key ?? "");
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  return NextResponse.json({ configured: true, ok: verifyMasterKey(key) });
}
