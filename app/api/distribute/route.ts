// =============================================================================
// POST /api/distribute
// =============================================================================
// Genera el PDF FOG-11 firmado (sello de integridad SHA-256) y lo distribuye:
//   - Email vía Resend (PDF adjunto)
//   - Slack vía Incoming Webhook (resumen; opcional)
//
// Env vars (cargar en Vercel / .env.local, NO en el repo):
//   RESEND_API_KEY        clave de Resend
//   RESEND_FROM           remitente verificado, ej: "KIR Minutas <minuta@kir.com.ar>"
//   SLACK_WEBHOOK_URL     (opcional) Incoming Webhook del canal de KIR
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { renderMinutePDF, computeIntegrity } from "@/lib/pdf";
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
  slack?: boolean; // default true si hay webhook configurado
  minuteId?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

async function postToSlack(
  webhook: string,
  meeting: Meeting,
  analysis: Analysis,
  integ: { minuteId: string; hash: string },
  recipientsCount: number
) {
  const pend = analysis.tasks.filter((t) => !/complet/i.test(t.status || ""));
  const topPend = pend
    .slice(0, 8)
    .map((t) => {
      const r = t.responsible ? ` — *${t.responsible}*` : "";
      const d = t.dueDate ? ` _(vence ${fmtDate(t.dueDate)})_` : t.deadline ? ` _(${t.deadline})_` : "";
      return `• ${t.text}${r}${d}`;
    })
    .join("\n");

  const text =
    `*Minuta FOG-11 — ${meeting.name}* (${fmtDate(meeting.date)})\n` +
    `Área: *${meeting.area || "—"}* · Tareas: *${analysis.tasks.length}* (${pend.length} pendientes) · Riesgos: *${analysis.risks.length}*\n` +
    (analysis.executiveSummary ? `\n${analysis.executiveSummary}\n` : "") +
    (topPend ? `\n*Acciones pendientes:*\n${topPend}\n` : "") +
    `\nPDF FOG-11 enviado por email a ${recipientsCount} destinatario(s). ` +
    `ID: \`${integ.minuteId}\``;

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Slack ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

export async function POST(req: NextRequest) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!resendKey || !from) {
    return NextResponse.json(
      {
        error:
          "Email no configurado: faltan RESEND_API_KEY y/o RESEND_FROM en el servidor. (RESEND_FROM debe ser un remitente de un dominio verificado en Resend, ej: \"KIR Minutas <minuta@kir.com.ar>\").",
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

  const integ = computeIntegrity(meeting, participants, analysis, body.minuteId);

  // Logo accesible por URL para el render del PDF
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const hostHeader = req.headers.get("host") || "";
  const logoUrl = hostHeader ? `${proto}://${hostHeader}/kir-logo.png` : undefined;

  let pdf: Buffer;
  try {
    pdf = await renderMinutePDF({
      meeting,
      participants,
      analysis,
      logoUrl,
      minuteId: integ.minuteId,
    });
  } catch (e: any) {
    console.error("PDF render error:", e);
    return NextResponse.json(
      { error: "No se pudo generar el PDF: " + (e.message || e) },
      { status: 500 }
    );
  }

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
  <table style="border-collapse:collapse;font-size:12px;color:#444;margin:12px 0">
    <tr><td style="padding:2px 8px;color:#888">ID de minuta</td><td style="padding:2px 8px;font-family:monospace">${integ.minuteId}</td></tr>
    <tr><td style="padding:2px 8px;color:#888">Huella SHA-256</td><td style="padding:2px 8px;font-family:monospace;font-size:10px">${integ.hash}</td></tr>
  </table>
  <p style="color:#006B68;font-weight:bold">»» KIR S.A. — Pasión por crear</p>
  <hr style="border:none;border-top:1px solid #ddd"/>
  <p style="font-size:11px;color:#888">Documento con sello de integridad. Si algún ítem estuviere incompleto o fuere incorrecto, notificar al emisor dentro de los cinco días de emitida. Generado por KIR Meeting Agent.</p>
</div>`;

  // 1) Email vía Resend
  try {
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from,
      to: recipients,
      cc: cc.length ? cc : undefined,
      subject,
      html,
      attachments: [
        {
          filename: `minuta_${slug(meeting.name)}_${meeting.date}.pdf`,
          content: pdf,
        },
      ],
    });
    if (error) {
      throw new Error(typeof error === "string" ? error : error.message || JSON.stringify(error));
    }
  } catch (e: any) {
    console.error("Resend send error:", e);
    return NextResponse.json(
      { error: "Error enviando el email (Resend): " + (e.message || e) },
      { status: 502 }
    );
  }

  // 2) Slack (opcional, best-effort: no falla la distribución si Slack falla)
  let slackPosted = false;
  let slackError: string | undefined;
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (webhook && body.slack !== false) {
    try {
      await postToSlack(webhook, meeting, analysis, integ, recipients.length);
      slackPosted = true;
    } catch (e: any) {
      slackError = e.message || String(e);
      console.error("Slack post error:", e);
    }
  }

  return NextResponse.json({
    ok: true,
    sent: recipients.length,
    cc: cc.length,
    recipients,
    minuteId: integ.minuteId,
    slackPosted,
    slackConfigured: !!webhook,
    slackError,
  });
}
