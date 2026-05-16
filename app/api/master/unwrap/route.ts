// POST /api/master/unwrap { key, masterWrap } → { dek }
// Recuperacion con clave maestra: si la clave es valida, devuelve la DEK para
// que el cliente descifre la minuta localmente. Accion de admin.
import { NextRequest, NextResponse } from "next/server";
import { masterKey, verifyMasterKey, unwrapWithMaster } from "@/lib/server-crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!masterKey()) {
    return NextResponse.json(
      { error: "MASTER_KEY no configurada en el servidor" },
      { status: 500 }
    );
  }
  let key = "";
  let masterWrap: any = null;
  try {
    const body = await req.json();
    key = String(body?.key ?? "");
    masterWrap = body?.masterWrap ?? null;
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  if (!verifyMasterKey(key)) {
    return NextResponse.json({ error: "Clave maestra incorrecta." }, { status: 403 });
  }
  if (!masterWrap || !masterWrap.salt || !masterWrap.iv || !masterWrap.ct) {
    return NextResponse.json(
      { error: "Esta minuta no tiene recuperación por clave maestra (se protegió sin master)." },
      { status: 400 }
    );
  }
  try {
    const dek = unwrapWithMaster(masterWrap);
    return NextResponse.json({ ok: true, dek });
  } catch (e: any) {
    return NextResponse.json(
      { error: "No se pudo recuperar la clave de la minuta: " + (e.message || e) },
      { status: 500 }
    );
  }
}
