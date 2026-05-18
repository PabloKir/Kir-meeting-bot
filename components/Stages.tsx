"use client";

import { useStore } from "@/lib/store";
import { SectionHead, BracketedCard, CardHead, Button, Chev, Tag, Alert } from "./Brand";
import { Actions } from "./Setup";
import type { Task } from "@/lib/types";
import { useState, useEffect, useRef } from "react";
import {
  saveOrUpdateMeeting,
  listMeetings,
  deleteMeeting,
  exportHistoryJSON,
  importHistoryJSON,
  syncFromServer,
  isProtected,
  protectMeeting,
  unlockPayload,
  removeProtection,
  unlockPayloadWithMaster,
  isMasterConfigured,
  type StoredMeeting,
  type MeetingPayload,
} from "@/lib/history";

// =============================================================================
// QUESTIONS
// =============================================================================
export function QuestionsStage({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const questions = useStore((s) => s.questions);
  const answerQuestion = useStore((s) => s.answerQuestion);
  const analysis = useStore((s) => s.analysis);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const markDone = useStore((s) => s.markDone);

  const applyAnswers = () => {
    let tasks = [...analysis.tasks];
    let risks = [...analysis.risks];

    questions.forEach((q) => {
      if (q.answer === null) return;
      if (q.type === "missing-responsible" && q.taskIndex != null) {
        const t = tasks[q.taskIndex];
        if (!t) return;
        if (q.answer === "__skip__") tasks[q.taskIndex] = { ...t, text: "[SKIP]" };
        else if (q.answer === "__pending__") tasks[q.taskIndex] = { ...t, responsible: "Pendiente de asignar" };
        else if (q.answer === "__custom__") tasks[q.taskIndex] = { ...t, responsible: q.custom || "Pendiente" };
        else tasks[q.taskIndex] = { ...t, responsible: q.answer };
      }
      if (q.type === "missing-deadline" && q.taskIndex != null) {
        const t = tasks[q.taskIndex];
        if (!t) return;
        if (q.answer === "__pending__") tasks[q.taskIndex] = { ...t, deadline: "Por definir" };
        else if (q.answer === "__custom__") tasks[q.taskIndex] = { ...t, deadline: q.custom || "Por definir" };
        else tasks[q.taskIndex] = { ...t, deadline: q.answer };
      }
      if (q.type === "risk-escalation" && q.riskIndex != null) {
        const r = risks[q.riskIndex];
        if (!r) return;
        if (q.answer === "__skip__") risks[q.riskIndex] = { ...r, text: "[SKIP]" };
        else if (q.answer === "critico") risks[q.riskIndex] = { ...r, text: "[CRÍTICO] " + r.text };
        else if (q.answer === "escalar") risks[q.riskIndex] = { ...r, text: "[ESCALAR] " + r.text };
      }
    });
    tasks = tasks.filter((t) => t.text !== "[SKIP]");
    risks = risks.filter((r) => r.text !== "[SKIP]");
    setAnalysis({ ...analysis, tasks, risks });
    markDone("questions");
    onNext();
  };

  if (questions.length === 0) {
    return (
      <>
        <SectionHead
          eyebrow="Stage B.04 · Preguntas"
          title="Sin ambigüedades"
          subtitle="El agente no detectó ambigüedades que requieran tu confirmación. Pasamos al cierre."
          meta={{ num: "B.04", label: "0 preguntas" }}
        />
        <Actions
          left={<Button variant="ghost" onClick={onBack}>«« Volver</Button>}
          right={<Button variant="primary" onClick={() => { markDone("questions"); onNext(); }}>Ir a cierre <Chev className="text-white" /></Button>}
        />
      </>
    );
  }

  const answered = questions.filter((q) => q.answer !== null).length;

  return (
    <>
      <SectionHead
        eyebrow="Stage B.04 · Preguntas del agente"
        title="Resolver ambigüedades"
        subtitle="El agente identificó información incompleta. Confirmá responsables, plazos y criterios antes del cierre."
        meta={{ num: "B.04", label: `${answered}/${questions.length} respondidas` }}
      />

      {questions.map((q) => (
        <div key={q.id} className="bg-white border border-kir-negro p-6 mb-4">
          <div className="font-mono text-[10px] text-kir-gris mb-2">{q.id} · {q.type}</div>
          <div className="font-display font-bold text-lg mb-2" style={{ letterSpacing: "-0.01em" }}>{q.text}</div>
          <div className="text-kir-gris text-sm border-l-2 border-kir-teal pl-3 mb-5 italic">{q.context}</div>
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const isCustom = opt.value === "__custom__";
              const selected = q.answer === opt.value;
              return (
                <div
                  key={opt.key}
                  onClick={() => answerQuestion(q.id, opt.value)}
                  className={`flex items-center gap-3 p-3 px-4 border cursor-pointer transition-colors ${
                    selected ? (isCustom ? "bg-white text-kir-negro border-kir-teal" : "bg-kir-negro text-white border-kir-negro") : "bg-white border-kir-negro hover:bg-kir-gris-papel"
                  }`}
                >
                  <span className={`font-mono text-[11px] min-w-[24px] ${selected && !isCustom ? "text-kir-teal" : "text-kir-gris"}`}>
                    [{opt.key}]
                  </span>
                  <span className="flex-1 text-sm">{opt.label}</span>
                  {isCustom && selected && (
                    <input
                      type="text"
                      className="flex-1 bg-transparent outline-none text-sm border-none"
                      value={q.custom}
                      onChange={(e) => answerQuestion(q.id, opt.value, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Escribir respuesta…"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <Actions
        left={<Button variant="ghost" onClick={onBack}>«« Volver al análisis</Button>}
        right={<Button variant="primary" onClick={applyAnswers}>Aplicar y cerrar <Chev className="text-white" /></Button>}
      />
    </>
  );
}

// =============================================================================
// CLOSURE
// =============================================================================
export function ClosureStage({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const analysis = useStore((s) => s.analysis);
  const updateTask = useStore((s) => s.updateTask);
  const addTask = useStore((s) => s.addTask);
  const removeTask = useStore((s) => s.removeTask);
  const participants = useStore((s) => s.participants);
  const markDone = useStore((s) => s.markDone);

  const responsibles = participants.filter((p) => p.canBeResponsible);
  const tasks = analysis.tasks;
  const sinResp = tasks.filter((t) => !t.responsible || /pendiente/i.test(t.responsible)).length;
  const sinPlazo = tasks.filter(
    (t) => !t.dueDate && (!t.deadline || /pendiente|por definir/i.test(t.deadline))
  ).length;
  const confirmadas = tasks.filter((t) => t.confirmed).length;
  const blocked = sinResp + sinPlazo;

  const handleClose = () => {
    if (blocked > 0) {
      if (!confirm(`Hay ${sinResp} tareas sin responsable y ${sinPlazo} sin plazo. ¿Cerrar igual? Las incompletas quedarán marcadas como "pendiente de definir".`)) return;
    }
    markDone("closure");
    onNext();
  };

  return (
    <>
      <SectionHead
        eyebrow="Stage C.01 · Cierre formal"
        title="Validación antes de cerrar"
        subtitle="Antes de que los participantes se retiren, confirmá responsables, plazos y próximos pasos."
        meta={{ num: "C.01", label: "FOG · Validación" }}
      />

      <div className="grid grid-cols-4 border border-kir-negro mb-6">
        <Stat label="Tareas totales" value={tasks.length} />
        <Stat label="Sin responsable" value={sinResp} alert={sinResp > 0} />
        <Stat label="Sin plazo" value={sinPlazo} alert={sinPlazo > 0} />
        <Stat label="Confirmadas" value={confirmadas} ok last />
      </div>

      {blocked > 0 && (
        <Alert variant="warn" title="Hay tareas incompletas">
          {sinResp + sinPlazo} tareas tienen responsable o plazo sin definir. Completalas antes de cerrar.
        </Alert>
      )}

      <BracketedCard>
        <CardHead title="Tareas asignadas — validar" id="FOG-11 / 04" />

        <div className="grid grid-cols-[30px_1fr_170px_170px_90px_40px] gap-2 font-display uppercase text-kir-gris border-b border-kir-negro pb-2 mb-2" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
          <div>#</div>
          <div>Tarea</div>
          <div>Responsable</div>
          <div>Plazo</div>
          <div>Prioridad</div>
          <div />
        </div>

        {tasks.length === 0 ? (
          <div className="py-6 text-center text-kir-gris italic">— Sin tareas detectadas —</div>
        ) : (
          tasks.map((t, i) => (
            <div key={i} className="grid grid-cols-[30px_1fr_170px_170px_90px_40px] gap-2 items-center py-2 border-b border-kir-gris-border">
              <div className="font-mono text-[11px] text-kir-gris">{String(i + 1).padStart(2, "0")}</div>
              <input className="kir-input" style={{ padding: "6px 8px", fontSize: 13 }} value={t.text} onChange={(e) => updateTask(i, { text: e.target.value })} />
              <select
                className={`kir-input ${(!t.responsible || /pendiente/i.test(t.responsible)) ? "border-kir-rojo" : ""}`}
                style={{ padding: "6px 8px", fontSize: 13 }}
                value={t.responsible || ""}
                onChange={(e) => updateTask(i, { responsible: e.target.value })}
              >
                <option value="">— Sin asignar —</option>
                {responsibles.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
                {t.responsible && !responsibles.find((p) => p.name === t.responsible) && (
                  <option value={t.responsible}>{t.responsible}</option>
                )}
              </select>
              <div className="flex flex-col gap-1">
                <input
                  type="date"
                  className={`kir-input ${(!t.dueDate && (!t.deadline || /pendiente|por definir/i.test(t.deadline))) ? "border-kir-rojo" : ""}`}
                  style={{ padding: "5px 6px", fontSize: 12 }}
                  value={t.dueDate || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const human = v
                      ? (() => { const [y, m, d] = v.split("-"); return `${d}/${m}/${y}`; })()
                      : t.deadline;
                    updateTask(i, { dueDate: v || null, deadline: human || null });
                  }}
                />
                <input
                  className="kir-input"
                  style={{ padding: "4px 6px", fontSize: 11 }}
                  value={t.dueDate ? "" : (t.deadline || "")}
                  onChange={(e) => updateTask(i, { deadline: e.target.value })}
                  placeholder={t.dueDate ? "(fecha fijada arriba)" : "o texto: Próxima reunión"}
                  disabled={!!t.dueDate}
                />
              </div>
              <select
                className="kir-input"
                style={{ padding: "6px 8px", fontSize: 13 }}
                value={t.priority}
                onChange={(e) => updateTask(i, { priority: e.target.value as Task["priority"] })}
              >
                <option>Alta</option>
                <option>Media</option>
                <option>Baja</option>
              </select>
              <button onClick={() => removeTask(i)} className="bg-transparent border border-kir-gris-border cursor-pointer p-1 text-kir-gris hover:text-kir-rojo hover:border-kir-rojo">×</button>
            </div>
          ))
        )}

        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => addTask({
            text: "", responsible: null, deadline: null, dueDate: null, priority: "Media", status: "Pendiente", confirmed: false,
          })}>
            Agregar tarea manual <Chev />
          </Button>
        </div>
      </BracketedCard>

      <Actions
        left={<Button variant="ghost" onClick={onBack}>«« Volver a preguntas</Button>}
        right={
          <Button variant={blocked > 0 ? "danger" : "primary"} onClick={handleClose}>
            Confirmar cierre <Chev className={blocked > 0 ? "text-kir-rojo" : "text-white"} />
          </Button>
        }
      />
    </>
  );
}

function Stat({ label, value, alert, ok, last }: { label: string; value: number; alert?: boolean; ok?: boolean; last?: boolean }) {
  return (
    <div className={`p-6 bg-white ${!last ? "border-r border-kir-negro" : ""}`}>
      <div className="font-display uppercase text-kir-gris mb-2" style={{ fontSize: 9, letterSpacing: "0.22em" }}>{label}</div>
      <div
        className={`font-display font-black ${alert ? "text-kir-rojo" : ok ? "text-kir-teal" : ""}`}
        style={{ fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1 }}
      >
        {value}
      </div>
    </div>
  );
}

// Plazo a mostrar: prioriza la fecha estructurada (dueDate) formateada
// dd/mm/aaaa; si no, el texto libre (deadline); si no, un fallback.
function plazoOf(t: { dueDate?: string | null; deadline?: string | null }, fallback = "Por definir"): string {
  if (t.dueDate) {
    const [y, m, d] = t.dueDate.split("-");
    return `${d}/${m}/${y}`;
  }
  return t.deadline || fallback;
}

// =============================================================================
// MINUTE
// =============================================================================
export function MinuteStage({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const meeting = useStore((s) => s.meeting);
  const participants = useStore((s) => s.participants);
  const analysis = useStore((s) => s.analysis);
  const capture = useStore((s) => s.capture);
  const markDone = useStore((s) => s.markDone);
  const setMeeting = useStore((s) => s.setMeeting);
  const setParticipants = useStore((s) => s.setParticipants);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setStage = useStore((s) => s.setStage);
  const resetSession = useStore((s) => s.reset);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [distOpen, setDistOpen] = useState(false);
  const [distTo, setDistTo] = useState("");
  const [distCc, setDistCc] = useState("");
  const [distMsg, setDistMsg] = useState("");
  const [distSlack, setDistSlack] = useState(true);
  const [distSending, setDistSending] = useState(false);

  useEffect(() => {
    markDone("minute");
    // Auto-guardar la minuta en el historial local (solo si hay contenido real)
    const hasContent =
      !!analysis.executiveSummary ||
      analysis.tasks.length + analysis.decisions.length + analysis.topics.length > 0;
    if (hasContent && meeting.name.trim()) {
      try {
        saveOrUpdateMeeting({
          meeting,
          participants,
          analysis,
          utteranceCount: capture.utterances.length,
        });
      } catch (e) {
        console.error("No se pudo guardar la minuta en el historial:", e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  // D.03.10 — pre-armado de la próxima minuta con los compromisos abiertos
  const buildNextMinute = () => {
    const open = analysis.tasks.filter((t) => !/complet/i.test(t.status || ""));
    if (open.length === 0) {
      showToast("No hay compromisos abiertos para arrastrar a una próxima minuta.");
      return;
    }
    if (
      !confirm(
        `Crear una nueva minuta de seguimiento arrastrando ${open.length} compromiso(s) abierto(s)? Se reinicia la sesión actual (esta minuta ya quedó guardada en el Historial).`
      )
    )
      return;
    const today = new Date().toISOString().slice(0, 10);
    const prevName = meeting.name;
    const prevDate = fmtDate(meeting.date);
    resetSession();
    setMeeting({
      name: `Seguimiento — ${prevName}`.slice(0, 120),
      date: today,
      time: new Date().toTimeString().slice(0, 5),
      area: meeting.area,
      objective: `Seguimiento de compromisos abiertos de "${prevName}" (${prevDate}).`,
      type: "seguimiento",
      formality: meeting.formality,
      expectedDuration: "30",
      expectedResults: ["tareas"],
    });
    setParticipants(participants.map((p) => ({ ...p })));
    setAnalysis({
      executiveSummary: `Reunión de seguimiento. Se arrastran ${open.length} compromiso(s) abierto(s) de la minuta "${prevName}" (${prevDate}).`,
      topics: [],
      decisions: [],
      tasks: open.map((t) => ({ ...t, confirmed: false, status: "Pendiente" as const })),
      risks: [],
      openQuestions: [],
      nextSteps: [],
    });
    setStage("closure");
  };

  const asistentes = participants.filter((p) => p.attended);
  const conCopia = participants.filter((p) => !p.attended);

  const minuteAsText = () => {
    const A = analysis;
    const lines: string[] = [];
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("  MINUTA DE REUNIÓN — KIR S.A.");
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("");
    lines.push(meeting.name.toUpperCase());
    lines.push(`${fmtDate(meeting.date)} · ${meeting.time} hs · Formulario FOG-11 Rev.2`);
    lines.push("");
    lines.push("── 01 · DATOS DE LA REUNIÓN ──────────────────────────────────");
    lines.push(`Tipo:       ${meeting.type}`);
    lines.push(`Área:       ${meeting.area || "—"}`);
    lines.push(`Duración:   ${meeting.expectedDuration} min estimados`);
    lines.push(`Objetivo:   ${meeting.objective || "—"}`);
    lines.push(`Formalidad: ${meeting.formality}`);
    lines.push("");
    lines.push("── 02 · ASISTENTES ───────────────────────────────────────────");
    lines.push(`Asistentes: ${asistentes.map((p) => `${p.name} (${p.initials})`).join(", ")}`);
    if (conCopia.length) lines.push(`Con copia:  ${conCopia.map((p) => `${p.name} (${p.initials})`).join(", ")}`);
    lines.push("");
    lines.push("── 03 · RESUMEN EJECUTIVO ───────────────────────────────────");
    lines.push(A.executiveSummary || "—");
    lines.push("");
    lines.push("── 04 · TEMAS TRATADOS ───────────────────────────────────────");
    A.topics.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
    if (A.topics.length === 0) lines.push("  — Sin temas —");
    lines.push("");
    lines.push("── 05 · DECISIONES TOMADAS ───────────────────────────────────");
    A.decisions.forEach((d, i) => lines.push(`  ${i + 1}. ${d}`));
    if (A.decisions.length === 0) lines.push("  — Sin decisiones —");
    lines.push("");
    lines.push("── 06 · TAREAS Y RESPONSABLES ────────────────────────────────");
    A.tasks.forEach((t, i) => {
      lines.push(`  ${String(i + 1).padStart(2, "0")}. ${t.text}`);
      lines.push(`      → ${t.responsible || "PENDIENTE"} · ${plazoOf(t, "POR DEFINIR")} · ${t.priority} · ${t.status}`);
    });
    if (A.tasks.length === 0) lines.push("  — Sin tareas —");
    lines.push("");
    lines.push("── 07 · RIESGOS Y BLOQUEOS ───────────────────────────────────");
    A.risks.forEach((r, i) => lines.push(`  ${i + 1}. [${r.level}] ${r.text}${r.mitigation ? " | Mitigación: " + r.mitigation : ""}`));
    if (A.risks.length === 0) lines.push("  — Sin riesgos —");
    lines.push("");
    lines.push("── 08 · PREGUNTAS ABIERTAS ───────────────────────────────────");
    A.openQuestions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    if (A.openQuestions.length === 0) lines.push("  — Sin preguntas —");
    lines.push("");
    lines.push("── 09 · PRÓXIMOS PASOS ───────────────────────────────────────");
    A.nextSteps.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
    if (A.nextSteps.length === 0) lines.push("  — Sin próximos pasos —");
    lines.push("");
    lines.push("───────────────────────────────────────────────────────── »»");
    lines.push("Generado por KIR Meeting Agent · Pasión por crear");
    return lines.join("\n");
  };

  const slug = (s: string) =>
    (s || "reunion").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

  const downloadFile = (content: string, ext: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `minuta_${slug(meeting.name)}_${meeting.date}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Descarga iniciada");
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(minuteAsText());
      showToast("Minuta copiada");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = minuteAsText();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showToast("Minuta copiada");
    }
  };

  const openDistribute = () => {
    // Prefill con los emails de los participantes que asistieron
    const to = participants
      .filter((p) => p.attended && p.email && p.email.trim())
      .map((p) => p.email!.trim());
    const cc = participants
      .filter((p) => !p.attended && p.email && p.email.trim())
      .map((p) => p.email!.trim());
    setDistTo(to.join(", "));
    setDistCc(cc.join(", "));
    setDistMsg("");
    setDistOpen(true);
  };

  const sendDistribution = async () => {
    const recipients = distTo
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const cc = distCc
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      showToast("Cargá al menos un email destinatario.");
      return;
    }
    setDistSending(true);
    try {
      const res = await fetch("/api/distribute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meeting,
          participants,
          analysis,
          recipients,
          cc,
          message: distMsg,
          slack: distSlack,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const slackMsg = data.slackConfigured
        ? data.slackPosted
          ? " · Slack notificado"
          : data.slackError
          ? " · Slack falló"
          : ""
        : "";
      showToast(`Minuta enviada a ${data.sent} destinatario(s)${data.cc ? ` + ${data.cc} en copia` : ""}${slackMsg}.`);
      setDistOpen(false);
    } catch (e: any) {
      showToast("Error al enviar: " + (e.message || e));
    } finally {
      setDistSending(false);
    }
  };

  return (
    <>
      <SectionHead
        eyebrow="Stage C.02 · Documento final"
        title="Minuta lista para distribuir"
        subtitle="Formato KIR estilo FOG-11 Rev.2. Editable in-place. Copiá, exportá a PDF, o distribuí por email (PDF FOG-11 adjunto) a los participantes."
        meta={{ num: "C.02", label: "FOG · Minuta" }}
      />

      <div className="flex justify-between items-center px-4 py-3 bg-kir-negro text-white" style={{ fontSize: 10, letterSpacing: "0.22em" }}>
        <div className="font-display uppercase">Minuta · {meeting.name || "—"}</div>
        <div className="flex gap-2">
          <ToolBtn onClick={() => setEditing(!editing)}>{editing ? "Bloquear" : "Editar"}</ToolBtn>
          <ToolBtn onClick={copyToClipboard}>Copiar</ToolBtn>
          <ToolBtn onClick={() => downloadFile(minuteAsText(), "txt", "text/plain")}>.txt</ToolBtn>
          <ToolBtn onClick={() => openPrintWindow(buildFog11HTML(meeting, participants, analysis))}>Exportar PDF</ToolBtn>
          <ToolBtn onClick={buildNextMinute}>Próxima minuta »</ToolBtn>
          <ToolBtn onClick={openDistribute}>Distribuir »»</ToolBtn>
        </div>
      </div>

      {distOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(34,34,34,0.55)" }}>
          <div className="bg-white border border-kir-negro w-[640px] max-w-[92vw] max-h-[88vh] overflow-y-auto">
            <div className="flex justify-between items-center px-5 py-3 bg-kir-negro text-white" style={{ fontSize: 11, letterSpacing: "0.22em" }}>
              <span className="font-display uppercase">Distribuir minuta · PDF FOG-11</span>
              <button onClick={() => setDistOpen(false)} className="text-white text-lg leading-none cursor-pointer">×</button>
            </div>
            <div className="p-6">
              <div className="text-xs text-kir-gris mb-4 leading-relaxed">
                Se genera el PDF FOG-11 firmado (sello de integridad SHA-256) y se envía como adjunto vía Resend. Separá varios emails con coma.
              </div>
              <div className="mb-4">
                <label className="kir-label">Para (asistentes)</label>
                <textarea
                  className="kir-input min-h-[60px] resize-y"
                  value={distTo}
                  onChange={(e) => setDistTo(e.target.value)}
                  placeholder="nombre@kir.com.ar, otro@kir.com.ar"
                />
              </div>
              <div className="mb-4">
                <label className="kir-label">Con copia (opcional)</label>
                <textarea
                  className="kir-input min-h-[44px] resize-y"
                  value={distCc}
                  onChange={(e) => setDistCc(e.target.value)}
                  placeholder="cc@kir.com.ar"
                />
              </div>
              <div className="mb-5">
                <label className="kir-label">Mensaje (opcional)</label>
                <textarea
                  className="kir-input min-h-[70px] resize-y"
                  value={distMsg}
                  onChange={(e) => setDistMsg(e.target.value)}
                  placeholder="Texto adicional que va en el cuerpo del email, antes del adjunto."
                />
              </div>
              <label className="flex items-center gap-2 mb-5 cursor-pointer select-none text-sm text-kir-negro">
                <input
                  type="checkbox"
                  checked={distSlack}
                  onChange={(e) => setDistSlack(e.target.checked)}
                  style={{ accentColor: "#006B68" }}
                />
                También notificar al canal de Slack (si está configurado en el servidor)
              </label>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setDistOpen(false)} disabled={distSending}>
                  Cancelar
                </Button>
                <Button variant="primary" onClick={sendDistribution} disabled={distSending}>
                  {distSending ? "Enviando…" : "Enviar minuta"} <Chev className="text-white" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="minute-doc bg-white border border-kir-negro p-12 px-14 relative"
        contentEditable={editing}
        suppressContentEditableWarning
        style={editing ? { outline: "2px dashed #006B68", outlineOffset: 4 } : {}}
      >
        <span className="absolute bottom-4 right-6 font-display font-black text-2xl text-kir-teal" style={{ letterSpacing: "-0.12em" }}>»»</span>
        <h2>{meeting.name || "Minuta de reunión"}</h2>
        <div className="text-kir-gris font-mono text-[11px] mb-8">
          KIR S.A. · {fmtDate(meeting.date)} · {meeting.time} · Formulario FOG-11 Rev.2
        </div>

        <h3><span className="num">01</span>Datos de la reunión</h3>
        <div className="meta-row"><div className="k">Tipo</div><div>{meeting.type}</div></div>
        <div className="meta-row"><div className="k">Área / sector</div><div>{meeting.area || "—"}</div></div>
        <div className="meta-row"><div className="k">Fecha y hora</div><div>{fmtDate(meeting.date)} — {meeting.time} hs</div></div>
        <div className="meta-row"><div className="k">Duración estimada</div><div>{meeting.expectedDuration} min</div></div>
        <div className="meta-row"><div className="k">Objetivo</div><div>{meeting.objective || "—"}</div></div>
        <div className="meta-row"><div className="k">Formalidad</div><div>{meeting.formality}</div></div>

        <h3><span className="num">02</span>Asistentes</h3>
        <table>
          <thead><tr><th>Asistentes ({asistentes.length})</th><th>Con copia ({conCopia.length})</th></tr></thead>
          <tbody><tr>
            <td>{asistentes.map((p) => <div key={p.id}>{p.name} ({p.initials})</div>)}</td>
            <td>{conCopia.length === 0 ? "—" : conCopia.map((p) => <div key={p.id}>{p.name} ({p.initials})</div>)}</td>
          </tr></tbody>
        </table>

        <h3><span className="num">03</span>Resumen ejecutivo</h3>
        <p className="text-sm leading-relaxed">{analysis.executiveSummary || "—"}</p>

        <h3><span className="num">04</span>Temas tratados</h3>
        {analysis.topics.length === 0 ? <p className="text-kir-gris italic text-sm">— Sin temas registrados —</p> : <ul>{analysis.topics.map((t, i) => <li key={i}>{t}</li>)}</ul>}

        <h3><span className="num">05</span>Decisiones tomadas</h3>
        {analysis.decisions.length === 0 ? <p className="text-kir-gris italic text-sm">— Sin decisiones formales —</p> : <ul>{analysis.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>}

        <h3><span className="num">06</span>Tareas y responsables</h3>
        {analysis.tasks.length === 0 ? <p className="text-kir-gris italic text-sm">— Sin tareas —</p> : (
          <table>
            <thead><tr><th>N°</th><th>Tarea</th><th>Responsable</th><th>Fecha</th><th>Prioridad</th><th>Estado</th></tr></thead>
            <tbody>
              {analysis.tasks.map((t, i) => (
                <tr key={i}>
                  <td>{String(i + 1).padStart(2, "0")}</td>
                  <td>{t.text}</td>
                  <td><b>{t.responsible || "Pendiente"}</b></td>
                  <td>{plazoOf(t)}</td>
                  <td>{t.priority}</td>
                  <td>{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3><span className="num">07</span>Riesgos y bloqueos</h3>
        {analysis.risks.length === 0 ? <p className="text-kir-gris italic text-sm">— Sin riesgos —</p> : <ul>{analysis.risks.map((r, i) => <li key={i}><b>[{r.level}]</b> {r.text}{r.mitigation && <em> — Mitigación: {r.mitigation}</em>}</li>)}</ul>}

        <h3><span className="num">08</span>Preguntas abiertas</h3>
        {analysis.openQuestions.length === 0 ? <p className="text-kir-gris italic text-sm">— Sin preguntas pendientes —</p> : <ul>{analysis.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>}

        <h3><span className="num">09</span>Próximos pasos</h3>
        {analysis.nextSteps.length === 0 ? <p className="text-kir-gris italic text-sm">— Sin próximos pasos —</p> : <ul>{analysis.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>}

        <h3><span className="num">10</span>Notas adicionales</h3>
        <p className="text-sm text-kir-gris leading-relaxed">
          Minuta elaborada por: <b>{(participants.find((p) => p.role === "Facilitador") || {}).name || "—"}</b><br />
          Asistida por KIR Meeting Agent + Claude Sonnet 4.6 + AssemblyAI. Si cualquiera de los ítems aquí desarrollados estuviere incompleto o fuere incorrecto, por favor notificar al emisor dentro de los cinco días de emitida.
        </p>
      </div>

      <Actions
        left={<Button variant="ghost" onClick={onBack}>«« Volver a cierre</Button>}
        right={<Button variant="primary" onClick={onNext}>Ver mejoras sugeridas <Chev className="text-white" /></Button>}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 bg-kir-negro text-white px-5 py-3 font-display font-bold uppercase z-50" style={{ fontSize: 11, letterSpacing: "0.18em" }}>
          <span className="text-kir-teal mr-2">»»</span>{toast}
        </div>
      )}
    </>
  );
}

function ToolBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 border border-white bg-transparent text-white font-display font-bold uppercase cursor-pointer hover:bg-white hover:text-kir-negro"
      style={{ fontSize: 10, letterSpacing: "0.18em" }}
    >
      <span className="text-kir-teal mr-1">»</span>{children}
    </button>
  );
}

// =============================================================================
// PDF export — formato FOG-11 Rev.2 oficial de KIR S.A.
// =============================================================================
// Genera un HTML standalone con el layout de FOG-11 y lo abre en una nueva
// ventana auto-disparando window.print(). El usuario elige "Guardar como PDF"
// en el dialogo del navegador (Chrome/Edge/Firefox lo soportan nativo). Asi
// evitamos sumar dependencias pesadas como jsPDF + html2canvas.
// =============================================================================

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    alert("El navegador bloqueo el pop-up. Permiti pop-ups para esta pagina y volve a intentar.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Esperamos a que el logo cargue antes de disparar el dialogo de impresion
  const trigger = () => {
    try { w.focus(); w.print(); } catch (e) { console.error(e); }
  };
  const img = w.document.querySelector("img");
  if (img && !img.complete) {
    img.addEventListener("load", () => setTimeout(trigger, 200));
    img.addEventListener("error", () => setTimeout(trigger, 200));
  } else {
    setTimeout(trigger, 400);
  }
}

function buildFog11HTML(meeting: any, participants: any[], analysis: any): string {
  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;
  };
  const asistentes = participants.filter((p) => p.attended);
  const conCopia = participants.filter((p) => !p.attended);
  const facilitador = participants.find((p) => p.role === "Facilitador");
  const logoUrl = (typeof window !== "undefined" ? window.location.origin : "") + "/kir-logo.png";
  const E = escapeHtml;

  const accionesRows = analysis.tasks.map((t: any, i: number) => {
    // Buscar iniciales del responsable
    const resp = participants.find((p: any) => p.name === t.responsible);
    const initials = resp?.initials || (t.responsible ? t.responsible.split(" ").map((w: string) => w[0]).join("").toUpperCase() : "—");
    return `<tr>
      <td class="num-cell">${String(i + 1).padStart(2, "0")}.-</td>
      <td>${E(t.text)}${t.priority === "Alta" ? ' <span class="prio-alta">[PRIORIDAD ALTA]</span>' : ""}</td>
      <td class="r-cell">${E(initials)}</td>
      <td class="plazo-cell">${E(plazoOf(t, "Inmediato"))}</td>
    </tr>`;
  }).join("");

  const decisionsList = analysis.decisions.length === 0
    ? '<p class="empty">— Sin decisiones formales registradas —</p>'
    : `<ol>${analysis.decisions.map((d: string) => `<li>${E(d)}</li>`).join("")}</ol>`;

  const risksList = analysis.risks.length === 0
    ? '<p class="empty">— Sin riesgos registrados —</p>'
    : `<ul class="risks-list">${analysis.risks.map((r: any) => `<li><b>[${E(r.level).toUpperCase()}]</b> ${E(r.text)}${r.mitigation ? ` <i>Mitigación: ${E(r.mitigation)}</i>` : ""}</li>`).join("")}</ul>`;

  const openQList = analysis.openQuestions.length === 0
    ? '<p class="empty">— Sin preguntas pendientes —</p>'
    : `<ol>${analysis.openQuestions.map((q: string) => `<li>${E(q)}</li>`).join("")}</ol>`;

  const nextStepsList = analysis.nextSteps.length === 0
    ? '<p class="empty">— Sin próximos pasos definidos —</p>'
    : `<ol>${analysis.nextSteps.map((s: string) => `<li>${E(s)}</li>`).join("")}</ol>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Minuta — ${E(meeting.name)} — KIR S.A.</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800;900&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Roboto', 'Arial', sans-serif; color: #222; font-size: 11px; line-height: 1.45; margin: 0; padding: 0; }
  .topbar { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 8px; }
  .topbar img { height: 56px; width: auto; display: block; }
  .topbar .formulario { font-family: 'Archivo', sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; text-align: right; line-height: 1.4; }
  .topbar .formulario b { display: block; font-weight: 700; color: #006B68; font-size: 11px; }
  .title-bar { background: #222; color: #fff; padding: 8px 12px; display: grid; grid-template-columns: 1fr auto; align-items: baseline; margin-bottom: 0; }
  .title-bar h1 { font-family: 'Archivo', sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; font-size: 16px; margin: 0; }
  .title-bar .meta { font-family: 'Archivo', sans-serif; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; }
  table.cabecera { width: 100%; border-collapse: collapse; border: 1px solid #222; margin-bottom: 0; }
  table.cabecera td { border: 1px solid #222; padding: 6px 8px; vertical-align: top; }
  table.cabecera .label { background: #f2f2f2; font-family: 'Archivo', sans-serif; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.14em; width: 18%; }
  table.asistentes { width: 100%; border-collapse: collapse; border: 1px solid #222; border-top: none; margin-bottom: 0; }
  table.asistentes th { background: #222; color: #fff; padding: 6px 10px; text-align: left; font-family: 'Archivo', sans-serif; font-weight: 700; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; border-right: 1px solid #444; }
  table.asistentes th:last-child { border-right: 1px solid #222; }
  table.asistentes td { border: 1px solid #222; padding: 6px 10px; vertical-align: top; width: 50%; }
  table.asistentes td .person { display: block; margin-bottom: 3px; }
  table.asistentes td .check { color: #006B68; font-weight: 700; margin-right: 4px; }
  .nota { border: 1px solid #222; border-top: none; padding: 8px 12px; font-size: 9.5px; background: #fafafa; line-height: 1.5; }
  .meta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #222; border-top: none; }
  .meta-row > div { padding: 6px 12px; font-family: 'Archivo', sans-serif; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
  .meta-row > div:first-child { border-right: 1px solid #222; }
  .meta-row b { font-weight: 700; color: #006B68; margin-right: 6px; }
  section.body-section { margin-top: 22px; page-break-inside: avoid; }
  section.body-section h2 { font-family: 'Archivo', sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; background: #222; color: #fff; padding: 5px 12px; margin: 0 0 0 0; display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: baseline; }
  section.body-section h2 .sec-num { color: #98989A; font-family: 'JetBrains Mono', monospace; font-weight: 400; font-size: 10px; }
  section.body-section .content { border: 1px solid #222; border-top: none; padding: 10px 14px; }
  section.body-section p.empty { color: #98989A; font-style: italic; margin: 4px 0; }
  table.acciones { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.acciones th { background: #f2f2f2; padding: 5px 8px; text-align: left; border: 1px solid #ccc; font-family: 'Archivo', sans-serif; text-transform: uppercase; font-size: 9px; letter-spacing: 0.14em; }
  table.acciones th.r-th { width: 8%; text-align: center; }
  table.acciones th.plazo-th { width: 16%; }
  table.acciones th.num-th { width: 7%; }
  table.acciones td { padding: 6px 8px; border: 1px solid #ddd; vertical-align: top; }
  table.acciones td.num-cell { font-family: 'JetBrains Mono', monospace; color: #006B68; font-weight: 500; text-align: center; }
  table.acciones td.r-cell { text-align: center; font-weight: 700; color: #222; }
  table.acciones td.plazo-cell { font-family: 'JetBrains Mono', monospace; font-size: 10px; }
  .prio-alta { color: #B23A2C; font-weight: 700; font-size: 9px; }
  ol, ul { margin: 4px 0 4px 0; padding-left: 18px; }
  ol li, ul li { margin-bottom: 4px; line-height: 1.5; }
  .risks-list li { padding: 3px 0; }
  .resumen-text { font-size: 11px; line-height: 1.6; text-align: justify; margin: 4px 0; }
  .footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #222; display: grid; grid-template-columns: 1fr auto; font-size: 9px; color: #666; font-family: 'Archivo', sans-serif; text-transform: uppercase; letter-spacing: 0.14em; }
  .footer .right { text-align: right; }
  .footer b { color: #006B68; }
  .print-controls { position: fixed; top: 12px; right: 12px; z-index: 9999; background: #222; color: #fff; padding: 10px 14px; font-family: 'Archivo', sans-serif; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; border: 1px solid #006B68; }
  .print-controls button { background: #006B68; color: #fff; border: none; padding: 6px 12px; font-family: inherit; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; cursor: pointer; margin-left: 10px; }
  @media print {
    .print-controls { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="print-controls">
    » Si el dialogo no aparecio, hace
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>

  <div class="topbar">
    <img src="${logoUrl}" alt="KIR S.A." />
    <div class="formulario">
      <b>Formulario: FOG-11 Rev.2</b>
      KIR S.A. — Pasión por crear
    </div>
  </div>

  <div class="title-bar">
    <h1>Minuta de reunión</h1>
    <div class="meta">Minuta · Versión: 0</div>
  </div>

  <table class="cabecera">
    <tr>
      <td class="label">Fecha</td>
      <td>${fmtDate(meeting.date)} — ${E(meeting.time)} hs</td>
      <td class="label">Obra / Sector</td>
      <td>${E(meeting.area) || "—"}</td>
    </tr>
    <tr>
      <td class="label">Objeto de la reunión</td>
      <td colspan="3">${E(meeting.objective) || E(meeting.name)}</td>
    </tr>
    <tr>
      <td class="label">Tipo</td>
      <td>${E(meeting.type)}</td>
      <td class="label">Duración est.</td>
      <td>${E(meeting.expectedDuration)} min</td>
    </tr>
  </table>

  <table class="asistentes">
    <thead>
      <tr>
        <th>Asistentes (${asistentes.length})</th>
        <th>Con copia (${conCopia.length})</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${asistentes.length === 0 ? "—" : asistentes.map((p: any) => `<span class="person"><span class="check">☒</span>${E(p.name)} (${E(p.initials)})</span>`).join("")}</td>
        <td>${conCopia.length === 0 ? "—" : conCopia.map((p: any) => `<span class="person"><span class="check">☒</span>${E(p.name)} (${E(p.initials)})</span>`).join("")}</td>
      </tr>
    </tbody>
  </table>

  <div class="meta-row">
    <div><b>Minuta elaborada por:</b> ${E(facilitador?.name) || "—"}</div>
    <div><b>Próxima reunión:</b> a definir</div>
  </div>

  <div class="nota">
    <b>NOTA:</b> Si cualquiera de los ítems aquí desarrollados estuviere incompleto o fuere incorrecto, por favor notificar al emisor de la minuta. El no hacerlo dentro de los cinco días de emitida o antes de la próxima reunión (lo que ocurra primero) constituye aceptación de la información contenida y como ésta es presentada.
  </div>

  ${analysis.executiveSummary ? `
  <section class="body-section">
    <h2><span class="sec-num">01</span>Resumen ejecutivo</h2>
    <div class="content"><p class="resumen-text">${E(analysis.executiveSummary)}</p></div>
  </section>` : ""}

  <section class="body-section">
    <h2><span class="sec-num">02</span>Acciones — Tareas, responsables, plazos</h2>
    <div class="content">
      ${analysis.tasks.length === 0 ? '<p class="empty">— Sin acciones registradas —</p>' : `
      <table class="acciones">
        <thead>
          <tr>
            <th class="num-th">N°</th>
            <th>Descripción de la acción</th>
            <th class="r-th">R</th>
            <th class="plazo-th">Plazo</th>
          </tr>
        </thead>
        <tbody>${accionesRows}</tbody>
      </table>`}
    </div>
  </section>

  <section class="body-section">
    <h2><span class="sec-num">03</span>Decisiones tomadas</h2>
    <div class="content">${decisionsList}</div>
  </section>

  <section class="body-section">
    <h2><span class="sec-num">04</span>Riesgos y bloqueos</h2>
    <div class="content">${risksList}</div>
  </section>

  <section class="body-section">
    <h2><span class="sec-num">05</span>Preguntas abiertas</h2>
    <div class="content">${openQList}</div>
  </section>

  <section class="body-section">
    <h2><span class="sec-num">06</span>Próximos pasos</h2>
    <div class="content">${nextStepsList}</div>
  </section>

  <div class="footer">
    <div><b>R</b>: Responsable de ejecutar la acción. &nbsp; · &nbsp; Generado por KIR Meeting Agent + Claude</div>
    <div class="right">FOG-11 Rev.2 — Minuta Reunión de Gerencia</div>
  </div>

</body>
</html>`;
}

// =============================================================================
// HISTORY — Lista de minutas guardadas en localStorage
// =============================================================================
export function HistoryStage({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  const setMeeting = useStore((s) => s.setMeeting);
  const setParticipants = useStore((s) => s.setParticipants);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setStage = useStore((s) => s.setStage);
  const markDone = useStore((s) => s.markDone);

  const [meetings, setMeetings] = useState<StoredMeeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Payloads descifrados en memoria para esta sesion (no se persisten)
  const [unlocked, setUnlocked] = useState<Record<string, MeetingPayload>>({});
  const [masterCfg, setMasterCfg] = useState(false);
  // Clave maestra cacheada en memoria para esta sesion (no se persiste)
  const masterKeyRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    isMasterConfigured().then(setMasterCfg);
  }, []);

  // Pide la clave maestra una vez por sesion y la cachea en memoria.
  const ensureMasterKey = (): string | null => {
    if (masterKeyRef.current) return masterKeyRef.current;
    const k = window.prompt("Ingresá la CLAVE MAESTRA:");
    if (k == null || k === "") return null;
    masterKeyRef.current = k;
    return k;
  };

  // Devuelve el contenido en claro de una minuta, o null si esta protegida
  // y todavia no se desbloqueo en esta sesion.
  const payloadOf = (m: StoredMeeting): MeetingPayload | null => {
    if (!isProtected(m)) {
      return {
        meeting: m.meeting!,
        participants: m.participants || [],
        analysis: m.analysis!,
        utteranceCount: m.utteranceCount || 0,
      };
    }
    return unlocked[m.id] || null;
  };

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  // 1) Pintamos lo local al instante. 2) Sincronizamos con el servidor
  // compartido (Vercel KV) y mergeamos. Si no hay KV, queda solo lo local.
  useEffect(() => {
    setMeetings(listMeetings());
    setLoaded(true);
    markDone("history");
    setSyncing(true);
    syncFromServer()
      .then((merged) => setMeetings(merged))
      .finally(() => setSyncing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => {
    setMeetings(listMeetings());
    syncFromServer().then((merged) => setMeetings(merged)).catch(() => {});
  };

  const handleExportBackup = () => {
    const json = exportHistoryJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `kir-historial-minutas_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Backup del historial descargado");
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = importHistoryJSON(String(reader.result || ""));
        refresh();
        showToast(
          `Importado: ${res.imported} nuevas, ${res.updated} actualizadas, ${res.skipped} omitidas. Total: ${res.total}`
        );
      } catch (err: any) {
        showToast("Error al importar: " + (err.message || "archivo invalido"));
      }
    };
    reader.onerror = () => showToast("No se pudo leer el archivo");
    reader.readAsText(file);
    e.target.value = "";
  };

  const titleOf = (m: StoredMeeting) =>
    isProtected(m) ? m.label || "(protegida)" : m.meeting?.name || "(sin nombre)";

  const handleLoad = (m: StoredMeeting) => {
    const p = payloadOf(m);
    if (!p) {
      showToast("Minuta protegida: desbloqueala primero con la clave.");
      return;
    }
    setMeeting(p.meeting);
    setParticipants(p.participants);
    setAnalysis(p.analysis);
    setStage("minute");
  };

  const handleDelete = async (m: StoredMeeting) => {
    if (!confirm(`¿Eliminar "${titleOf(m)}" del historial? Esta acción no se puede deshacer.`)) return;
    let mk: string | undefined;
    if (masterCfg) {
      const k = ensureMasterKey();
      if (k == null) {
        showToast("Eliminar requiere la clave maestra.");
        return;
      }
      mk = k;
    }
    try {
      await deleteMeeting(m.id, mk);
      setUnlocked((u) => {
        const n = { ...u };
        delete n[m.id];
        return n;
      });
      refresh();
      showToast("Minuta eliminada.");
    } catch (e: any) {
      // Clave incorrecta: olvidamos la cacheada para permitir reintento
      masterKeyRef.current = null;
      showToast(e.message || "No se pudo eliminar.");
    }
  };

  const handleExport = (m: StoredMeeting) => {
    const p = payloadOf(m);
    if (!p) {
      showToast("Minuta protegida: desbloqueala primero con la clave.");
      return;
    }
    const html = buildFog11HTML(p.meeting, p.participants, p.analysis);
    openPrintWindow(html);
  };

  const handleProtect = async (m: StoredMeeting) => {
    const pw = window.prompt(
      "Definí una clave para proteger esta minuta.\n\nGuardala bien: si la perdés, el contenido NO se puede recuperar (cifrado real)."
    );
    if (pw == null) return;
    const pw2 = window.prompt("Repetí la clave para confirmar:");
    if (pw2 == null) return;
    if (pw !== pw2) {
      showToast("Las claves no coinciden. No se protegió la minuta.");
      return;
    }
    try {
      await protectMeeting(m.id, pw);
      refresh();
      showToast("Minuta protegida y cifrada.");
    } catch (e: any) {
      showToast("No se pudo proteger: " + (e.message || e));
    }
  };

  const handleUnlock = async (m: StoredMeeting) => {
    const pw = window.prompt(`Clave para desbloquear "${titleOf(m)}":`);
    if (pw == null) return;
    try {
      const payload = await unlockPayload(m, pw);
      setUnlocked((u) => ({ ...u, [m.id]: payload }));
      showToast("Minuta desbloqueada para esta sesión.");
    } catch (e: any) {
      showToast(e.message || "No se pudo desbloquear.");
    }
  };

  const handleUnlockMaster = async (m: StoredMeeting) => {
    const k = ensureMasterKey();
    if (k == null) return;
    try {
      const payload = await unlockPayloadWithMaster(m, k);
      setUnlocked((u) => ({ ...u, [m.id]: payload }));
      showToast("Minuta abierta con clave maestra (sesión).");
    } catch (e: any) {
      masterKeyRef.current = null; // permitir reingresar si fue incorrecta
      showToast(e.message || "No se pudo abrir con la clave maestra.");
    }
  };

  const handleRemoveProtection = async (m: StoredMeeting) => {
    const pw = window.prompt(
      `Para quitar la protección de "${titleOf(m)}" ingresá la clave actual:`
    );
    if (pw == null) return;
    try {
      await removeProtection(m.id, pw);
      setUnlocked((u) => {
        const n = { ...u };
        delete n[m.id];
        return n;
      });
      refresh();
      showToast("Protección quitada. La minuta quedó en claro.");
    } catch (e: any) {
      showToast(e.message || "No se pudo quitar la protección.");
    }
  };

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const [y, mo, d] = iso.split("-");
    return `${d}/${mo}/${y}`;
  };
  const fmtSaved = (ts: number) => {
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  };

  return (
    <>
      <SectionHead
        eyebrow="Stage D.01 · Histórico"
        title="Reuniones guardadas"
        subtitle="Las minutas se guardan automáticamente al llegar a la pantalla C.02 Minuta y se sincronizan con el servidor compartido. Las marcadas con 🔒 están cifradas con clave: el servidor solo guarda texto cifrado y hace falta la contraseña para verlas."
        meta={{ num: "D.01", label: syncing ? "Sincronizando…" : `${meetings.length} minutas` }}
      />

      {loaded && meetings.length === 0 && (
        <Alert title="Sin minutas guardadas">
          Cuando completes una reunión y llegues al stage <b>C.02 Minuta</b>, queda registrada acá automáticamente. Después podés exportarla a PDF de nuevo o volver a editarla.
        </Alert>
      )}

      {meetings.length > 0 && (
        <BracketedCard>
          <CardHead title={`Historial (${meetings.length})`} id="FOG-11 / 06" />
          <div className="grid grid-cols-[1fr_140px_90px_90px_320px] gap-3 font-display uppercase text-kir-gris border-b border-kir-negro pb-2 mb-2" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
            <div>Reunión</div>
            <div>Fecha</div>
            <div>Tareas</div>
            <div>Riesgos</div>
            <div>Acciones</div>
          </div>
          {meetings.map((m) => {
            const locked = isProtected(m);
            const p = payloadOf(m);
            const open = !!p; // contenido disponible (no protegida, o desbloqueada)
            return (
              <div
                key={m.id}
                className="grid grid-cols-[1fr_140px_90px_90px_320px] gap-3 items-center py-3 border-b border-kir-gris-border"
              >
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm truncate flex items-center gap-2" style={{ letterSpacing: "-0.01em" }}>
                    {locked && (
                      <span
                        title={open ? "Protegida — desbloqueada en esta sesión" : "Protegida con clave"}
                        className={open ? "text-kir-teal" : "text-kir-rojo"}
                        style={{ fontWeight: 900 }}
                      >
                        {open ? "🔓" : "🔒"}
                      </span>
                    )}
                    <span className="truncate">{titleOf(m)}</span>
                  </div>
                  <div className="text-xs text-kir-gris mt-1 truncate">
                    {locked && !open ? (
                      <span className="font-mono text-kir-rojo">CONTENIDO CIFRADO</span>
                    ) : (
                      <span className="font-mono">{p?.meeting.area || "—"}</span>
                    )}
                    {" · "}
                    Guardada {fmtSaved(m.savedAt)}
                  </div>
                </div>
                <div className="font-mono text-xs text-kir-negro">
                  {fmtDate(open ? p!.meeting.date : m.dateLabel || "")}
                  {open && (
                    <div className="text-[10px] text-kir-gris mt-0.5">{p!.meeting.time} hs</div>
                  )}
                </div>
                <div className="text-center">
                  {open ? (
                    <span className="font-display font-black text-lg" style={{ color: p!.analysis.tasks.length > 0 ? "#222" : "#98989A" }}>
                      {p!.analysis.tasks.length}
                    </span>
                  ) : (
                    <span className="text-kir-gris">—</span>
                  )}
                </div>
                <div className="text-center">
                  {open ? (
                    <span className="font-display font-black text-lg" style={{ color: p!.analysis.risks.length > 0 ? "#B23A2C" : "#98989A" }}>
                      {p!.analysis.risks.length}
                    </span>
                  ) : (
                    <span className="text-kir-gris">—</span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {locked && !open ? (
                    <>
                      <Button variant="primary" size="sm" onClick={() => handleUnlock(m)}>
                        Desbloquear <Chev className="text-white" />
                      </Button>
                      {masterCfg && (
                        <Button variant="ghost" size="sm" onClick={() => handleUnlockMaster(m)}>
                          Abrir con master
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => handleLoad(m)}>
                        Abrir <Chev />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleExport(m)}>
                        PDF
                      </Button>
                      {locked ? (
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveProtection(m)}>
                          Quitar clave
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => handleProtect(m)}>
                          🔒 Proteger
                        </Button>
                      )}
                    </>
                  )}
                  <Button variant="danger" size="sm" onClick={() => handleDelete(m)}>
                    Eliminar
                  </Button>
                </div>
              </div>
            );
          })}
        </BracketedCard>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportBackup}
        style={{ display: "none" }}
      />

      <Actions
        left={
          <>
            <Button variant="ghost" onClick={onBack}>«« Volver a la minuta</Button>
            <Button variant="ghost" onClick={handleExportBackup} disabled={meetings.length === 0}>
              Exportar backup .json
            </Button>
            <Button variant="ghost" onClick={() => importInputRef.current?.click()}>
              Importar backup .json
            </Button>
          </>
        }
        right={<Button variant="primary" onClick={onNext}>Ver mejoras <Chev className="text-white" /></Button>}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 bg-kir-negro text-white px-5 py-3 font-display font-bold uppercase z-50 max-w-[480px]" style={{ fontSize: 11, letterSpacing: "0.14em" }}>
          <span className="text-kir-teal mr-2">»»</span>{toast}
        </div>
      )}
    </>
  );
}

// =============================================================================
// IMPROVEMENTS
// =============================================================================
const IMPROVEMENTS = [
  { num: "01", cat: "Streaming", title: "Transcripción en tiempo real", desc: "Reemplazar upload async por WebSocket streaming a AssemblyAI Real-time o Deepgram Nova-2 para ver la transcripción durante la reunión.", tags: ["WebSocket", "Realtime"] },
  { num: "02", cat: "Calendar", title: "Integración Google/Outlook", desc: "Pre-cargar reuniones, fecha, participantes desde el calendario corporativo. Detección automática de la reunión actual.", tags: ["OAuth", "Calendar"] },
  { num: "03", cat: "Conferencing", title: "Bot Meet / Teams / Zoom", desc: "Conectar como bot a reuniones virtuales para capturar audio sin depender del mic local del facilitador.", tags: ["Bot", "Webhook"] },
  { num: "04", cat: "Distribución", title: "Email/Slack/PDF firmado", desc: "Generar PDF con firma digital y enviarlo automáticamente a participantes vía email/Slack. Plantillas FOG configurables.", tags: ["PDF", "DKIM"] },
  { num: "05", cat: "Gestión", title: "Sync con Asana/Jira/Monday", desc: "Cada tarea detectada se crea automáticamente en el gestor existente con responsable, plazo y prioridad.", tags: ["Sync", "API"] },
  { num: "06", cat: "Almacenamiento", title: "Persistencia y búsqueda", desc: "Vercel Postgres + Vercel KV para guardar todas las reuniones. Búsqueda full-text. Trazabilidad por área/proyecto.", tags: ["Postgres", "BI"] },
  { num: "07", cat: "Compliance", title: "Consentimiento digital", desc: "Pantalla bloqueante de consentimiento con firma digital de participantes al inicio. Logs de acceso ISO 27001.", tags: ["Legal", "ISO"] },
  { num: "08", cat: "IA", title: "Voiceprint identification", desc: "Entrenar voiceprints por participante con muestras previas para que la diarización sepa de antemano quién es quién.", tags: ["ML", "Auth"] },
  { num: "09", cat: "Dashboard", title: "Panel histórico + tendencias ✓ IMPLEMENTADO", desc: "Disponible en D.02 Dashboard: tareas recurrentes no cumplidas, tendencias de riesgos por área, carga por responsable y productividad de seguimiento.", tags: ["LISTO", "D.02"] },
  { num: "10", cat: "Automation", title: "Follow-up automático", desc: "Recordatorios 48hs antes del plazo. Pre-armado de próxima minuta con compromisos abiertos. Inbox Zero para tareas pendientes.", tags: ["CRON", "Email"] },
];

export function ImprovementsStage({ onBack }: { onBack: () => void }) {
  const reset = useStore((s) => s.reset);
  return (
    <>
      <SectionHead
        eyebrow="Stage D.03 · Roadmap"
        title="Mejoras sugeridas"
        subtitle="Áreas de evolución para llevar este producto a estándar enterprise. Cada una mantiene la identidad KIR y se integra al stack existente."
        meta={{ num: "D.03", label: "Roadmap" }}
      />

      <div className="grid grid-cols-2 gap-4">
        {IMPROVEMENTS.map((i) => (
          <div key={i.num} className="bg-white border border-kir-negro p-5">
            <div className="font-mono text-[11px] text-kir-teal mb-1">»» D.03.{i.num} · {i.cat}</div>
            <h4 className="font-display font-black uppercase text-sm mb-2" style={{ letterSpacing: "-0.01em" }}>{i.title}</h4>
            <p className="text-kir-gris text-xs leading-relaxed">{i.desc}</p>
            <div className="mt-3 flex gap-1.5 flex-wrap">
              {i.tags.map((t) => <Tag key={t} variant="teal">{t}</Tag>)}
            </div>
          </div>
        ))}
      </div>

      <Actions
        left={<Button variant="ghost" onClick={onBack}>«« Volver a la minuta</Button>}
        right={<Button onClick={() => { if (confirm("¿Iniciar nueva reunión? Se reinicia el flujo.")) reset(); }}>Nueva reunión</Button>}
      />
    </>
  );
}
