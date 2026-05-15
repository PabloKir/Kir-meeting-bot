// =============================================================================
// GET  /api/history          → lista todas las minutas guardadas en el server
// POST /api/history           → guarda/actualiza una minuta (body: StoredMeeting)
// =============================================================================
// Backend de persistencia compartida (Vercel KV / Upstash Redis). Si KV no
// esta configurado devolvemos { configured:false } y el cliente sigue con
// localStorage. Se usa un hash Redis: campo = id de la minuta, valor = JSON.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getRedis, HISTORY_KEY } from "@/lib/kv";

export const runtime = "nodejs";

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ configured: false, meetings: [] });
  }
  try {
    const all = await redis.hgetall<Record<string, any>>(HISTORY_KEY);
    const meetings = all
      ? Object.values(all).map((v) => (typeof v === "string" ? JSON.parse(v) : v))
      : [];
    meetings.sort((a: any, b: any) => (b?.savedAt || 0) - (a?.savedAt || 0));
    return NextResponse.json({ configured: true, meetings });
  } catch (e: any) {
    console.error("history GET error:", e);
    return NextResponse.json(
      { configured: true, error: "Error leyendo historial: " + (e.message || e), meetings: [] },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ configured: false, ok: false });
  }
  let meeting: any;
  try {
    const body = await req.json();
    meeting = body?.meeting ?? body;
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }
  if (!meeting || !meeting.id || !meeting.meeting || !meeting.analysis) {
    return NextResponse.json({ error: "Minuta invalida (falta id/meeting/analysis)" }, { status: 400 });
  }
  try {
    await redis.hset(HISTORY_KEY, { [meeting.id]: JSON.stringify(meeting) });
    return NextResponse.json({ configured: true, ok: true });
  } catch (e: any) {
    console.error("history POST error:", e);
    return NextResponse.json(
      { error: "Error guardando historial: " + (e.message || e) },
      { status: 502 }
    );
  }
}
