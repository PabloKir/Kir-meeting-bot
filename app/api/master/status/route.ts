// GET /api/master/status → indica si la clave maestra esta configurada
import { NextResponse } from "next/server";
import { masterKey } from "@/lib/server-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ configured: !!masterKey() });
}
