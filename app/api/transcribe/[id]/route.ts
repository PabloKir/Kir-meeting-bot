// =============================================================================
// GET /api/transcribe/[id]
// =============================================================================
// Polling: chequea el estado del transcript en AssemblyAI.
// Devuelve { status, utterances?, speakers?, errorMsg? }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY no configurada" },
      { status: 500 }
    );
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Falta job id" }, { status: 400 });
  }

  try {
    const res = await fetch(`${ASSEMBLYAI_BASE}/transcript/${id}`, {
      headers: { authorization: apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        { error: `AssemblyAI ${res.status}: ${txt}` },
        { status: 502 }
      );
    }
    const data = await res.json();

    // Mapear estados AssemblyAI a los nuestros
    const statusMap: Record<string, string> = {
      queued: "queued",
      processing: "processing",
      completed: "completed",
      error: "error",
    };
    const status = statusMap[data.status] || "processing";

    if (status === "error") {
      return NextResponse.json({
        status,
        errorMsg: data.error || "Error desconocido en transcripción",
      });
    }

    if (status !== "completed") {
      return NextResponse.json({ status });
    }

    // Procesar utterances
    const utterances = (data.utterances || []).map((u: any) => ({
      speaker: u.speaker || "?",
      text: u.text || "",
      start: u.start || 0,
      end: u.end || 0,
      confidence: u.confidence || 0,
    }));

    const speakers = Array.from(
      new Set(utterances.map((u: any) => u.speaker as string))
    ).sort() as string[];

    return NextResponse.json({
      status: "completed",
      utterances,
      speakers,
    });
  } catch (e: any) {
    console.error("AAI poll error:", e);
    return NextResponse.json(
      { error: "Error consultando AssemblyAI: " + (e.message || e) },
      { status: 502 }
    );
  }
}
