// =============================================================================
// POST /api/distribute
// =============================================================================
// Genera el PDF FOG-11 server-side y lo envia por email (SMTP corporativo KIR)
// a los participantes. PDF adjunto, sin firma criptografica.
//
// Env vars (cargar en Vercel, NO en el repo):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   SMTP_SECURE  (opcional: "true" para TLS implicito en puerto 465)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { renderMinutePDF } from "@/lib/pdf";
import type { Analysis, Meeting, Participant } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  meeting: Meeting;
  participants: Participant[];
  analysis: Analysis;
  recipients: string[];
  cc?: string[];
  subject?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    return NextResponse.json(
      {
        error:
          "SMTP no configurado en el servidor. Faltan variables SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM en Vercel.",
      },
      { status: 500 }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }

  const { meeting, participants, analysis } = body;
  if (!meeting || !analysis || !Array.isArray(participants)) {
    return NextResponse.json({ error: "Faltan datos de la minuta" }, { status: 400 });
  }

  const recipients = (body.recipients || [])
    .map((r) => r.trim())
    .filter((r) => EMAIL_RE.test(r));
  const cc = (body.cc || []).map((r) => r.trim()).filter((r) => EMAIL_RE.test(r));

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No hay destinatarios con email valido." },
      { status: 400 }
    );
  }

  // Logo accesible por URL para el render del PDF
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const hostHeader = req.headers.get("host") || "";
  const logoUrl = hostHeader ? `${proto}://${hostHeader}/kir-logo.png` : undefined;

  let pdf: Buffer;
  try {
    pdf = await renderMinutePDF({ meeting, participants, analysis, logoUrl });
  } catch (e: any) {
    console.error("PDF render error:", e);
    return NextResponse.json(
      { error: "No se pudo generar el PDF: " + (e.message || e) },
      { status: 500 }
    );
  }

  const fmtDate = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const slug = (s: string) =>
    (s || "reunion")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);

  const subject =
    body.subject?.trim() ||
    `Minuta de reunión — ${meeting.name} (${fmtDate(meeting.date)})`;

  const intro = body.message?.trim()
    ? `<p>${escapeHtml(body.message).replace(/\n/g, "<br/>")}</p>`
    : "";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;font-size:14px;line-height:1.5">
  <p>Estimados,</p>
  ${intro}
  <p>Se adjunta la minuta de la reunión <b>${escapeHtml(meeting.name)}</b> del ${fmtDate(meeting.date)}, en formato FOG-11 Rev.2.</p>
  <p style="color:#006B68;font-weight:bold">»» KIR S.A. — Pasión por crear</p>
  <hr style="border:none;border-top:1px solid #ddd"/>
  <p style="font-size:11px;color:#888">Documento generado por KIR Meeting Agent. Si algún ítem estuviere incompleto o fuere incorrecto, notificar al emisor dentro de los cinco días de emitida.</p>
</div>`;

  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from,
      to: recipients,
      cc: cc.length ? cc : undefined,
      subject,
      html,
      attachments: [
        {
          filename: `minuta_${slug(meeting.name)}_${meeting.date}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e: any) {
    console.error("SMTP send error:", e);
    return NextResponse.json(
      { error: "Error enviando el email: " + (e.message || e) },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    sent: recipients.length,
    cc: cc.length,
    recipients,
  });
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
