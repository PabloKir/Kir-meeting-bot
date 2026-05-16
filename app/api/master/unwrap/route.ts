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
    // verifyMasterKey ya pasó (la clave ingresada es la actual). Si el
    // descifrado GCM falla, esta minuta fue protegida con una MASTER_KEY
    // distinta (típicamente: se protegió ANTES de rotar/corregir la clave).
    const raw = String(e?.message || e);
    const isAuthFail =
      /unable to authenticate|unsupported state|bad decrypt|auth/i.test(raw);
    return NextResponse.json(
      {
        error: isAuthFail
          ? "La clave maestra es correcta, pero esta minuta se protegió con una clave maestra anterior (se rotó la MASTER_KEY después). No es recuperable por master. Abrila con su contraseña individual (DESBLOQUEAR) y volvé a protegerla para que quede recuperable con la clave maestra actual."
          : "No se pudo recuperar con la clave maestra: " + raw,
        code: isAuthFail ? "STALE_MASTER_WRAP" : "UNWRAP_ERROR",
      },
      { status: isAuthFail ? 409 : 500 }
    );
  }
}
