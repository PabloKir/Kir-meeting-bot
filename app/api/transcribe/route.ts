// =============================================================================
// POST /api/transcribe
// =============================================================================
// Recibe audio del navegador y lo envía a AssemblyAI para:
//   1) Upload del audio
//   2) Crear transcript con speaker_labels (diarización automática) en español
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

  let audioBuffer: ArrayBuffer;
  let speakersExpected: number | undefined;
  let language: string = "es";

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("audio") as File | null;
      const exp = form.get("speakers_expected");
      const lng = form.get("language");
      if (!file) throw new Error("Falta el archivo 'audio'");
      audioBuffer = await file.arrayBuffer();
      if (exp) speakersExpected = parseInt(exp.toString(), 10);
      if (lng) language = lng.toString();
    } else {
      // raw body (audio/webm, audio/mp4...)
      audioBuffer = await req.arrayBuffer();
      const exp = req.headers.get("x-speakers-expected");
      const lng = req.headers.get("x-language");
      if (exp) speakersExpected = parseInt(exp, 10);
      if (lng) language = lng;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Audio inválido" }, { status: 400 });
  }

  if (!audioBuffer || audioBuffer.byteLength < 1000) {
    return NextResponse.json({ error: "Audio vacío o demasiado corto" }, { status: 400 });
  }

  // 1) Upload audio a AssemblyAI
  let uploadUrl: string;
  try {
    const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/octet-stream",
      },
      body: Buffer.from(audioBuffer),
    });
    if (!uploadRes.ok) {
      const txt = await uploadRes.text();
      throw new Error(`Upload falló: ${uploadRes.status} ${txt}`);
    }
    const uploadData = await uploadRes.json();
    uploadUrl = uploadData.upload_url;
  } catch (e: any) {
    console.error("AAI upload error:", e);
    return NextResponse.json(
      { error: "Error subiendo audio a AssemblyAI: " + (e.message || e) },
      { status: 502 }
    );
  }

  // 2) Crear transcript con speaker_labels
  try {
    const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: uploadUrl,
        speaker_labels: true,
        language_code: language,
        punctuate: true,
        format_text: true,
        ...(speakersExpected ? { speakers_expected: speakersExpected } : {}),
      }),
    });
    if (!transcriptRes.ok) {
      const txt = await transcriptRes.text();
      throw new Error(`Create transcript falló: ${transcriptRes.status} ${txt}`);
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
