// POST /api/master/wrap { dek } → { masterWrap }
// Envuelve la DEK aleatoria de una minuta con la MASTER_KEY. El server solo
// ve la DEK (bytes aleatorios), nunca el contenido de la minuta.
import { NextRequest, NextResponse } from "next/server";
import { masterKey, wrapWithMaster } from "@/lib/server-crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!masterKey()) {
    return NextResponse.json({ configured: false });
  }
  let dek = "";
  try {
    const body = await req.json();
    dek = String(body?.dek ?? "");
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  if (!dek) {
    return NextResponse.json({ error: "Falta dek" }, { status: 400 });
  }
  try {
    return NextResponse.json({ configured: true, masterWrap: wrapWithMaster(dek) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "wrap error" }, { status: 500 });
  }
}
