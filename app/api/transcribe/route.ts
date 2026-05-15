// =============================================================================
// POST /api/transcribe
// =============================================================================
// Recibe la upload_url de un audio ya subido directamente a AssemblyAI desde
// el cliente (bypass del limite de 4.5 MB de Vercel) y crea el transcript con
// diarizacion (speaker_labels) en el idioma indicado.
//
// Body JSON: { uploadUrl: string, speakers_expected?: number, language?: string }
// Devuelve { jobId } — el cliente hace polling a /api/transcribe/[id]
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY no configurada en el servidor" },
      { status: 500 }
    );
  }

  let uploadUrl: string;
  let speakersExpected: number | undefined;
  let language = "es";

  try {
    const body = await req.json();
    uploadUrl = body.uploadUrl;
    if (typeof body.speakers_expected === "number") {
      speakersExpected = body.speakers_expected;
    } else if (typeof body.speakers_expected === "string") {
      const n = parseInt(body.speakers_expected, 10);
      if (!isNaN(n) && n > 0) speakersExpected = n;
    }
    if (typeof body.language === "string" && body.language) {
      language = body.language;
    }
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }

  if (!uploadUrl || typeof uploadUrl !== "string" || !uploadUrl.startsWith("http")) {
    return NextResponse.json({ error: "Falta uploadUrl valida" }, { status: 400 });
  }

  // Crear transcript con speaker_labels
  try {
    const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: uploadUrl,
        speech_models: ["universal-2"],
        speaker_labels: true,
        language_code: language,
        punctuate: true,
        format_text: true,
        ...(speakersExpected ? { speakers_expected: speakersExpected } : {}),
      }),
    });
    if (!transcriptRes.ok) {
      const txt = await transcriptRes.text();
      throw new Error(`Create transcript fallo: ${transcriptRes.status} ${txt}`);
    }
    const transcriptData = await transcriptRes.json();
    return NextResponse.json({
      jobId: transcriptData.id,
      status: transcriptData.status,
    });
  } catch (e: any) {
    console.error("AAI transcript error:", e);
    return NextResponse.json(
      { error: "Error creando transcript en AssemblyAI: " + (e.message || e) },
      { status: 502 }
    );
  }
}
