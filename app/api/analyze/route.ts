// =============================================================================
// POST /api/analyze
// =============================================================================
// Recibe meeting + participants + utterances diarizadas + speakerMap.
// Llama a Claude (Sonnet 4) con un prompt estructurado y devuelve:
//   - analysis: { executiveSummary, topics, decisions, tasks, risks, ... }
//   - questions: ambigüedades que el agente quiere confirmar al usuario
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  Analysis,
  AgentQuestion,
} from "@/lib/types";

export const runtime = "nodejs";
// 300s = maximo en Vercel Pro (default Hobby es 60s). Reuniones largas con
// transcripts grandes pueden tardar 1-3 minutos en Claude Sonnet.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
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

  const { meeting, participants, utterances, speakerMap, manualNotes } = body;

  // Construir transcript atribuido para Claude
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

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

  try {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    // Extraer texto
    const textBlock = msg.content.find((c: any) => c.type === "text") as any;
    const raw = textBlock?.text || "";

    // Parsear JSON
    const parsed = parseClaudeJSON(raw);

    // Validar/normalizar
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

    // Generar preguntas para ambigüedades
    const questions = generateQuestions(analysis, participants);

    const response: AnalyzeResponse = { analysis, questions };
    return NextResponse.json(response);
  } catch (e: any) {
    console.error("Claude analyze error:", e);
    return NextResponse.json(
      { error: "Error en Claude API: " + (e.message || e) },
      { status: 502 }
    );
  }
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

function parseClaudeJSON(raw: string): any {
  // Limpiar code fences si Claude los puso
  let text = raw.trim();
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");

  // Buscar el primer { y el último }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.substring(first, last + 1);

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON parse failed. Raw:", raw.substring(0, 500));
    return {};
  }
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
