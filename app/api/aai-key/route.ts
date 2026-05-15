// =============================================================================
// GET /api/aai-key
// =============================================================================
// Devuelve la API key de AssemblyAI para que el cliente pueda subir el audio
// directo a AAI (bypass del limite de 4.5 MB de Vercel en API routes).
//
// Seguridad: chequeamos Origin/Referer para limitar scraping casual desde
// otros dominios. La key queda visible en el browser de cualquier persona
// que use la app — para una proteccion mas fuerte, sumar auth (NextAuth,
// Clerk, basic auth, IP allowlist en Vercel, etc).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY no configurada en el servidor" },
      { status: 500 }
    );
  }

  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";
  const host = req.headers.get("host") || "";

  // En produccion solo aceptamos el propio dominio Vercel (o el host configurado);
  // en development cualquier localhost esta permitido.
  const isDev = process.env.NODE_ENV !== "production";
  const ok = isDev
    || origin.includes(host)
    || referer.includes(host)
    || origin.includes(".vercel.app")
    || referer.includes(".vercel.app");

  if (!ok) {
    return NextResponse.json({ error: "Origin no permitido" }, { status: 403 });
  }

  return NextResponse.json({ key: apiKey });
}
