// =============================================================================
// GET /api/cron/follow-up   (D.03.10 — recordatorios automáticos)
// =============================================================================
// Recorre el historial compartido (KV), junta tareas PENDIENTES con fecha
// (dueDate) que estén vencidas o por vencer dentro de 48 hs, las agrupa por
// responsable y manda un email-digest vía Resend a cada uno.
//
// Disparo:
//   - Vercel Cron: agregar en vercel.json (Vercel manda
//     Authorization: Bearer $CRON_SECRET automáticamente si la env existe).
//   - VPS: cron del sistema → curl con header Authorization: Bearer <secret>
//     o ?secret=<secret>.
//
// Env: CRON_SECRET (obligatoria para habilitar), RESEND_API_KEY, RESEND_FROM.
// Dedupe: una tarea no se recuerda más de una vez por día (KV, TTL 24h).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { Resend } from "resend";
import { getRedis, HISTORY_KEY } from "@/lib/kv";
import type { StoredMeeting } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DAY = 86400_000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const qs = new URL(req.url).searchParams.get("secret") || "";
  return auth === `Bearer ${secret}` || qs === secret;
}

const fmt = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const esc = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "KV no configurado" }, { status: 503 });
  }
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!resendKey || !from) {
    return NextResponse.json(
      { error: "RESEND_API_KEY / RESEND_FROM no configurados" },
      { status: 500 }
    );
  }

  // Cargar todo el historial
  let meetings: StoredMeeting[] = [];
  try {
    const all = await redis.hgetall<Record<string, any>>(HISTORY_KEY);
    meetings = all
      ? Object.values(all).map((v) => (typeof v === "string" ? JSON.parse(v) : v))
      : [];
  } catch (e: any) {
    return NextResponse.json(
      { error: "Error leyendo historial: " + (e.message || e) },
      { status: 502 }
    );
  }

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 2 * DAY).toISOString().slice(0, 10);

  // responsable(email) -> { name, vencidas[], porVencer[] }
  interface Item {
    text: string;
    dueDate: string;
    meeting: string;
    area: string;
  }
  const byEmail = new Map<
    string,
    { name: string; vencidas: Item[]; porVencer: Item[] }
  >();

  for (const m of meetings) {
    if ((m as any).protected || !m.analysis || !m.meeting) continue;
    const parts = m.participants || [];
    for (const t of m.analysis.tasks || []) {
      if (/complet/i.test(t.status || "")) continue;
      if (!t.dueDate) continue;
      const overdue = t.dueDate < todayISO;
      const soon = t.dueDate >= todayISO && t.dueDate <= horizon;
      if (!overdue && !soon) continue;

      const resp = parts.find(
        (p) => p.name && t.responsible && p.name === t.responsible
      );
      const email = resp?.email?.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

      const entry =
        byEmail.get(email) ||
        { name: resp!.name, vencidas: [] as Item[], porVencer: [] as Item[] };
      const item: Item = {
        text: t.text,
        dueDate: t.dueDate,
        meeting: m.meeting.name || "(sin nombre)",
        area: m.meeting.area || "",
      };
      (overdue ? entry.vencidas : entry.porVencer).push(item);
      byEmail.set(email, entry);
    }
  }

  const resend = new Resend(resendKey);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [email, data] of byEmail.entries()) {
    // Dedupe diario por (email + set de tareas)
    const fp = crypto
      .createHash("sha256")
      .update(
        email +
          "|" +
          [...data.vencidas, ...data.porVencer]
            .map((i) => i.text + i.dueDate)
            .sort()
            .join("|")
      )
      .digest("hex")
      .slice(0, 24);
    const dedupeKey = `kir:rmd:${todayISO}:${fp}`;
    try {
      const already = await redis.get(dedupeKey);
      if (already) {
        skipped++;
        continue;
      }
    } catch {
      /* si falla el check, igual mandamos */
    }

    const row = (i: Item, overdue: boolean) =>
      `<tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(i.text)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;color:${overdue ? "#B23A2C" : "#222"};font-weight:bold;white-space:nowrap">${fmt(i.dueDate)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;color:#888">${esc(i.meeting)}${i.area ? " · " + esc(i.area) : ""}</td>
      </tr>`;

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;font-size:14px;line-height:1.5">
  <p>Hola ${esc(data.name)},</p>
  <p>Resumen de tus tareas abiertas según las minutas de KIR (FOG-11):</p>
  ${
    data.vencidas.length
      ? `<p style="color:#B23A2C;font-weight:bold;margin-bottom:4px">Vencidas (${data.vencidas.length})</p>
         <table style="border-collapse:collapse;width:100%;font-size:13px"><tbody>${data.vencidas
           .map((i) => row(i, true))
           .join("")}</tbody></table>`
      : ""
  }
  ${
    data.porVencer.length
      ? `<p style="color:#B8860B;font-weight:bold;margin:14px 0 4px">Por vencer (próx. 48 hs) (${data.porVencer.length})</p>
         <table style="border-collapse:collapse;width:100%;font-size:13px"><tbody>${data.porVencer
           .map((i) => row(i, false))
           .join("")}</tbody></table>`
      : ""
  }
  <p style="color:#006B68;font-weight:bold;margin-top:16px">»» KIR S.A. — Pasión por crear</p>
  <p style="font-size:11px;color:#888">Recordatorio automático del KIR Meeting Agent. Si una tarea ya está cerrada, actualizá su estado en la minuta correspondiente.</p>
</div>`;

    try {
      const { error } = await resend.emails.send({
        from,
        to: [email],
        subject: `KIR · Tus tareas abiertas (${data.vencidas.length} vencidas, ${data.porVencer.length} por vencer)`,
        html,
      });
      if (error) throw new Error((error as any).message || JSON.stringify(error));
      await redis.set(dedupeKey, "1", { ex: 86400 }).catch(() => {});
      sent++;
    } catch (e: any) {
      errors.push(`${email}: ${e.message || e}`);
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    responsablesNotificados: sent,
    omitidosPorDedupe: skipped,
    errores: errors,
  });
}
