// =============================================================================
// GET /api/analyze/[id]  → estado / resultado del job de análisis
// =============================================================================
// Polling del cliente. Devuelve:
//   { status: "processing" }
//   { status: "completed", analysis, questions }
//   { status: "error", error }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jobKey = (id: string) => `kir:analyze:${id}`;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { status: "error", error: "Almacenamiento de jobs no disponible (KV no configurado)" },
      { status: 503 }
    );
  }
  const { id } = params;
  if (!id) {
    return NextResponse.json({ status: "error", error: "Falta job id" }, { status: 400 });
  }

  try {
    const raw = await redis.get<string | Record<string, unknown>>(jobKey(id));
    if (!raw) {
      // TTL vencido o id inexistente
      return NextResponse.json(
        { status: "error", error: "El trabajo expiró o no existe. Reintentá el análisis." },
        { status: 404 }
      );
    }
    const job = typeof raw === "string" ? JSON.parse(raw) : raw;
    return NextResponse.json(job);
  } catch (e: any) {
    console.error("analyze poll error:", e);
    return NextResponse.json(
      { status: "error", error: "Error consultando el estado: " + (e.message || e) },
      { status: 502 }
    );
  }
}
