// =============================================================================
// POST /api/analyze  (asíncrono)
// =============================================================================
// La llamada a Claude tarda 1-3 min en reuniones grandes. Detrás de
// Cloudflare + oauth2-proxy hay timeouts cortos (30-100s) que cortaban la
// request síncrona con 502. Solución: el POST arranca el trabajo y devuelve
// un { jobId } al instante; Claude corre en background con waitUntil() y el
// resultado se guarda en KV (Redis). El cliente hace polling a
// GET /api/analyze/[id]. Ninguna request individual es larga → ningún
// proxy/Cloudflare la corta.
//
// Fallback: si NO hay KV configurado (dev local sin Redis), se ejecuta de
// forma síncrona y se devuelve { analysis, questions } como antes.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import Anthropic from "@anthropic-ai/sdk";
import { getRedis } from "@/lib/kv";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  Analysis,
  AgentQuestion,
} from "@/lib/types";

export const runtime = "nodejs";
// 300s = máximo en Vercel Pro. El trabajo en background corre acá adentro;
// el POST/GET en sí responden en milisegundos.
export const maxDuration = 300;

const JOB_TTL = 3600; // seg — los jobs viven 1h en KV
const jobKey = (id: string) => `kir:analyze:${id}`;

interface AnalyzeJob {
  status: "processing" | "completed" | "error";
  createdAt: number;
  analysis?: Analysis;
  questions?: AnalyzeResponse["questions"];
  error?: string;
}

// Núcleo: arma el prompt, llama a Claude, normaliza y genera preguntas.
// Lanza si Claude falla o la API key no está.
async function runAnalysis(body: AnalyzeRequest): Promise<AnalyzeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en el servidor");

  const { meeting, participants, utterances, speakerMap, manualNotes } = body;

  const idToName: Record<string, string> = {};
  participants.forEach((p) => (idToName[p.id] = p.name));

  const attributedLines = utterances.map((u) => {
    const pid = speakerMap[u.speaker];
    const name = (pid && idToName[pid]) || `Orador ${u.speaker}`;
    return `${name}: ${u.text}`;
  });

  const transcript = attributedLines.join("\n");
  const participantList = participants
    .filter((p) => p.attended)
    .map((p) => `- ${p.name} (${p.role}${p.canBeResponsible ? ", puede ser responsable" : ""})`)
    .join("\n");

  const prompt = buildPrompt({
    meetingName: meeting.name,
    meetingDate: meeting.date,
    objective: meeting.objective,
    participantList,
    transcript,
    manualNotes,
  });

  const model = resolveModel(body.model);
  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = msg.content.find((c: any) => c.type === "text") as any;
  const raw = textBlock?.text || "";

  // Si Claude cortó por límite de tokens, el JSON viene truncado/ inválido.
  if ((msg as any).stop_reason === "max_tokens") {
    throw new Error(
      "La reunión es muy extensa y la respuesta se truncó. Probá de nuevo con el modelo Haiku (más rápido y con mejor manejo de transcripciones largas) o dividí la reunión."
    );
  }

  let parsed: any;
  try {
    parsed = parseClaudeJSON(raw);
  } catch {
    throw new Error(
      "No se pudo interpretar la respuesta del modelo (JSON inválido, probablemente por el tamaño de la reunión). Reintentá; si persiste, usá el modelo Haiku."
    );
  }

  const analysis: Analysis = {
    executiveSummary: parsed.executiveSummary || "",
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    tasks: Array.isArray(parsed.tasks)
      ? parsed.tasks.map((t: any) => ({
          text: t.text || "",
          responsible: t.responsible || null,
          responsibleParticipantId: matchParticipantId(t.responsible, participants),
          deadline: t.deadline || null,
          priority: ["Alta", "Media", "Baja"].includes(t.priority) ? t.priority : "Media",
          status: ["Pendiente", "En curso", "Completado"].includes(t.status) ? t.status : "Pendiente",
          confirmed: false,
          requestedBy: t.requestedBy || null,
        }))
      : [],
    risks: Array.isArray(parsed.risks)
      ? parsed.risks.map((r: any) => ({
          text: r.text || "",
          level: ["Alta", "Media", "Baja"].includes(r.level) ? r.level : "Media",
          mitigation: r.mitigation || null,
        }))
      : [],
    openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
    nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
  };

  // Si quedó completamente vacío, NO devolvemos un resultado "completado"
  // en blanco: lo tratamos como error para que el cliente muestre Reintentar.
  const totalItems =
    analysis.topics.length +
    analysis.decisions.length +
    analysis.tasks.length +
    analysis.risks.length +
    analysis.openQuestions.length +
    analysis.nextSteps.length;
  if (!analysis.executiveSummary && totalItems === 0) {
    throw new Error(
      "El modelo no devolvió contenido analizable (posible respuesta vacía o formato inesperado). Reintentá; si persiste, probá con otro modelo."
    );
  }

  const questions = generateQuestions(analysis, participants);
  return { analysis, questions };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY no configurada en el servidor" },
      { status: 500 }
    );
  }

  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const redis = getRedis();

  // Sin KV: modo síncrono (dev local). Puede tardar; aceptable sin proxy.
  if (!redis) {
    try {
      const result = await runAnalysis(body);
      return NextResponse.json(result);
    } catch (e: any) {
      console.error("Claude analyze error (sync):", e);
      return NextResponse.json(
        { error: "Error en Claude API: " + (e.message || e) },
        { status: 502 }
      );
    }
  }

  // Con KV: job async + polling.
  const jobId = randomUUID();
  const initial: AnalyzeJob = { status: "processing", createdAt: Date.now() };
  try {
    await redis.set(jobKey(jobId), JSON.stringify(initial), { ex: JOB_TTL });
  } catch (e: any) {
    return NextResponse.json(
      { error: "No se pudo registrar el trabajo de análisis: " + (e.message || e) },
      { status: 502 }
    );
  }

  // Corre Claude después de responder. waitUntil mantiene viva la función
  // (hasta maxDuration) sin bloquear la respuesta HTTP.
  waitUntil(
    (async () => {
      try {
        const result = await runAnalysis(body);
        const done: AnalyzeJob = {
          status: "completed",
          createdAt: initial.createdAt,
          analysis: result.analysis,
          questions: result.questions,
        };
        await redis.set(jobKey(jobId), JSON.stringify(done), { ex: JOB_TTL });
      } catch (e: any) {
        console.error("Claude analyze error (job):", e);
        const fail: AnalyzeJob = {
          status: "error",
          createdAt: initial.createdAt,
          error: "Error en Claude API: " + (e?.message || e),
        };
        await redis
          .set(jobKey(jobId), JSON.stringify(fail), { ex: JOB_TTL })
          .catch(() => {});
      }
    })()
  );

  return NextResponse.json({ jobId, status: "processing" });
}

// =============================================================================
// HELPERS
// =============================================================================

function buildPrompt(args: {
  meetingName: string;
  meetingDate: string;
  objective: string;
  participantList: string;
  transcript: string;
  manualNotes: string;
}): string {
  return `Sos el agente analista de minutas de KIR S.A. (Argentina, empresa de obras civiles e industriales, ISO 9001). Estás analizando una reunión real para producir una minuta institucional sobria, en formato similar a FOG-11 Rev.2 (formato corporativo de KIR).

# Reunión
- Nombre: ${args.meetingName}
- Fecha: ${args.meetingDate}
- Objetivo: ${args.objective}

# Participantes
${args.participantList}

# Transcripción atribuida (quién dijo qué)
${args.transcript}

${args.manualNotes ? `\n# Notas manuales del facilitador\n${args.manualNotes}\n` : ""}

# Tu tarea
Analizá la transcripción y devolvé EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin \`\`\`, sin explicación) con esta forma exacta:

{
  "executiveSummary": "2-4 oraciones de resumen ejecutivo institucional. Tono sobrio, KIR no usa marketing.",
  "topics": ["Tema 1 con título corto", "Tema 2", ...],
  "decisions": ["Decisión formal 1 (qué se decidió, área impactada)", ...],
  "tasks": [
    {
      "text": "Acción concreta a realizar",
      "responsible": "Nombre completo del responsable (usar exactamente uno de los nombres de Participantes) o null si no está claro",
      "deadline": "Fecha o plazo en formato DD/MM/AAAA, o 'Inmediato', 'Próxima reunión', etc. o null",
      "priority": "Alta" | "Media" | "Baja",
      "status": "Pendiente",
      "requestedBy": "Nombre de quien pidió la tarea, o null"
    }
  ],
  "risks": [
    {
      "text": "Descripción del riesgo o bloqueo",
      "level": "Alta" | "Media" | "Baja",
      "mitigation": "Cómo se prevé mitigarlo, o null"
    }
  ],
  "openQuestions": ["Preguntas que quedaron sin respuesta", ...],
  "nextSteps": ["Próximos pasos acordados", ...]
}

# Reglas de inferencia
- INFERÍ responsables a partir de quién encarga la tarea + a quién se la encarga. Ej: si Pablo le dice a Diego "tenés que hacer X", el responsable es Diego, no Pablo.
- Si una persona dice "yo voy a hacer X" o "me encargo", esa persona es el responsable.
- Si un participante no está en la lista, usá null en responsible.
- Distinguí decisiones formales de tareas operativas. "Se decide / se acuerda" → decisión. "Tiene que hacer X" → tarea.
- Para riesgos, capturá específicamente lo que pueda comprometer obra, caja, plazos, calidad o seguridad. Tono institucional KIR.
- Si algo es ambiguo, dejá null en el campo correspondiente — el sistema le va a preguntar al usuario después.
- Tono: institucional, sobrio, profesional. Sin emojis. Sin lenguaje informal. Estilo de minuta corporativa argentina.

Devolvé SOLAMENTE el JSON, nada más.`;
}

// Modelos habilitados (allowlist). Claves estables hacia la UI; los IDs
// concretos de Anthropic se pueden ajustar acá o por env sin tocar el cliente.
const MODEL_MAP: Record<string, string> = {
  haiku: process.env.CLAUDE_MODEL_HAIKU || "claude-haiku-4-5",
  sonnet: process.env.CLAUDE_MODEL_SONNET || "claude-sonnet-4-6",
  opus: process.env.CLAUDE_MODEL_OPUS || "claude-opus-4-1",
};

function resolveModel(choice?: string): string {
  if (choice && MODEL_MAP[choice]) return MODEL_MAP[choice];
  // compatibilidad: CLAUDE_MODEL puede traer un id completo directo
  if (process.env.CLAUDE_MODEL) return process.env.CLAUDE_MODEL;
  return MODEL_MAP.sonnet;
}

function parseClaudeJSON(raw: string): any {
  // Limpiar code fences si Claude los puso
  let text = raw.trim();
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");

  // Buscar el primer { y el último }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.substring(first, last + 1);

  // Lanza si no parsea (el caller lo transforma en error visible con retry)
  return JSON.parse(text);
}

function matchParticipantId(
  name: string | null | undefined,
  participants: { id: string; name: string }[]
): string | null {
  if (!name) return null;
  const norm = name.trim().toLowerCase();
  const exact = participants.find((p) => p.name.toLowerCase() === norm);
  if (exact) return exact.id;
  // Match por primer nombre o apellido
  const firstWord = norm.split(/\s+/)[0];
  const partial = participants.find((p) => {
    const pn = p.name.toLowerCase();
    return pn.startsWith(firstWord) || pn.split(/\s+/).includes(firstWord);
  });
  return partial?.id || null;
}

function generateQuestions(
  analysis: Analysis,
  participants: AnalyzeRequest["participants"]
): AgentQuestion[] {
  const responsibles = participants.filter((p) => p.canBeResponsible);
  const qs: AgentQuestion[] = [];
  let qid = 1;
  const nextId = () => "Q" + String(qid++).padStart(2, "0");

  analysis.tasks.forEach((t, i) => {
    if (!t.responsible) {
      qs.push({
        id: nextId(),
        type: "missing-responsible",
        text: "¿Quién queda como responsable de esta tarea?",
        context: t.text,
        taskIndex: i,
        options: [
          ...responsibles.slice(0, 4).map((p) => ({
            key: p.initials,
            label: "Asignar a " + p.name,
            value: p.name,
          })),
          { key: "PD", label: "Dejar pendiente / definir luego", value: "__pending__" },
          { key: "NO", label: "No incluir en minuta", value: "__skip__" },
          { key: "CU", label: "Otro responsable (escribir)", value: "__custom__" },
        ],
        answer: null,
        custom: "",
      });
    }
    if (!t.deadline) {
      qs.push({
        id: nextId(),
        type: "missing-deadline",
        text: "¿Cuál es el plazo para esta tarea?",
        context: t.text,
        taskIndex: i,
        options: [
          { key: "IN", label: "Inmediato (esta semana)", value: "Inmediato" },
          { key: "15", label: "En 15 días", value: "En 15 días" },
          { key: "30", label: "En 30 días", value: "En 30 días" },
          { key: "PR", label: "Próxima reunión", value: "Próxima reunión" },
          { key: "PD", label: "Pendiente de definir", value: "__pending__" },
          { key: "CU", label: "Fecha específica (escribir)", value: "__custom__" },
        ],
        answer: null,
        custom: "",
      });
    }
  });

  analysis.risks.forEach((r, i) => {
    if (r.level === "Alta") {
      qs.push({
        id: nextId(),
        type: "risk-escalation",
        text: "¿Este riesgo de nivel alto debe escalarse?",
        context: r.text,
        riskIndex: i,
        options: [
          { key: "EG", label: "Escalar a gerencia", value: "escalar" },
          { key: "MN", label: "Mantener seguimiento normal", value: "normal" },
          { key: "CR", label: "Crítico — acción inmediata", value: "critico" },
          { key: "NO", label: "No registrar como riesgo", value: "__skip__" },
        ],
        answer: null,
        custom: "",
      });
    }
  });

  return qs;
}
