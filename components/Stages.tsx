"use client";

import { useStore } from "@/lib/store";
import { SectionHead, BracketedCard, CardHead, Button, Chev, Tag, Alert } from "./Brand";
import { Actions } from "./Setup";
import type { Task } from "@/lib/types";
import { useState, useEffect } from "react";

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
  const sinPlazo = tasks.filter((t) => !t.deadline || /pendiente|por definir/i.test(t.deadline)).length;
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
        <CardHead title="Tareas asignadas — validar" id="FOG-MA / 04" />

        <div className="grid grid-cols-[30px_1fr_180px_140px_100px_40px] gap-2 font-display uppercase text-kir-gris border-b border-kir-negro pb-2 mb-2" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
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
            <div key={i} className="grid grid-cols-[30px_1fr_180px_140px_100px_40px] gap-2 items-center py-2 border-b border-kir-gris-border">
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
              <input
                className={`kir-input ${(!t.deadline || /pendiente|por definir/i.test(t.deadline)) ? "border-kir-rojo" : ""}`}
                style={{ padding: "6px 8px", fontSize: 13 }}
                value={t.deadline || ""}
                onChange={(e) => updateTask(i, { deadline: e.target.value })}
                placeholder="DD/MM/AAAA"
              />
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
            text: "", responsible: null, deadline: null, priority: "Media", status: "Pendiente", confirmed: false,
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

// =============================================================================
// MINUTE
// =============================================================================
export function MinuteStage({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const meeting = useStore((s) => s.meeting);
  const participants = useStore((s) => s.participants);
  const analysis = useStore((s) => s.analysis);
  const markDone = useStore((s) => s.markDone);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    markDone("minute");
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

  const asistentes = participants.filter((p) => p.attended);
  const conCopia = participants.filter((p) => !p.attended);

  const minuteAsText = () => {
    const A = analysis;
    const lines: string[] = [];
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("  MINUTA DE REUNIÓN — KIR CONSTRUCCIONES S.R.L.");
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("");
    lines.push(meeting.name.toUpperCase());
    lines.push(`${fmtDate(meeting.date)} · ${meeting.time} hs · FOG-MA Rev.0`);
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
      lines.push(`      → ${t.responsible || "PENDIENTE"} · ${t.deadline || "POR DEFINIR"} · ${t.priority} · ${t.status}`);
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

  return (
    <>
      <SectionHead
        eyebrow="Stage C.02 · Documento final"
        title="Minuta lista para distribuir"
        subtitle="Formato KIR estilo FOG-11. Editable in-place. Copia al portapapeles, descarga como .html o .txt."
        meta={{ num: "C.02", label: "FOG · Minuta" }}
      />

      <div className="flex justify-between items-center px-4 py-3 bg-kir-negro text-white" style={{ fontSize: 10, letterSpacing: "0.22em" }}>
        <div className="font-display uppercase">Minuta · {meeting.name || "—"}</div>
        <div className="flex gap-2">
          <ToolBtn onClick={() => setEditing(!editing)}>{editing ? "Bloquear" : "Editar"}</ToolBtn>
          <ToolBtn onClick={copyToClipboard}>Copiar</ToolBtn>
          <ToolBtn onClick={() => downloadFile(minuteAsText(), "txt", "text/plain")}>.txt</ToolBtn>
          <ToolBtn onClick={() => downloadFile(buildMinuteHTML(meeting, participants, analysis), "html", "text/html")}>.html</ToolBtn>
        </div>
      </div>

      <div
        className="minute-doc bg-white border border-kir-negro p-12 px-14 relative"
        contentEditable={editing}
        suppressContentEditableWarning
        style={editing ? { outline: "2px dashed #006B68", outlineOffset: 4 } : {}}
      >
        <span className="absolute bottom-4 right-6 font-display font-black text-2xl text-kir-teal" style={{ letterSpacing: "-0.12em" }}>»»</span>
        <h2>{meeting.name || "Minuta de reunión"}</h2>
        <div className="text-kir-gris font-mono text-[11px] mb-8">
          KIR Construcciones S.R.L. · {fmtDate(meeting.date)} · {meeting.time} · FOG-MA Rev.0
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
                  <td>{t.deadline || "Por definir"}</td>
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

function buildMinuteHTML(meeting: any, participants: any[], analysis: any): string {
  const fmtDate = (iso: string) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const asistentes = participants.filter((p) => p.attended);
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>${meeting.name} — Minuta KIR</title>
<style>body{font-family:Roboto,sans-serif;color:#222;max-width:800px;margin:40px auto;padding:0 24px;font-size:14px;line-height:1.5}
h2{font-family:Archivo,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:-0.02em;font-size:28px}
h3{font-family:Archivo,sans-serif;font-weight:900;text-transform:uppercase;font-size:14px;border-bottom:1px solid #222;padding-bottom:6px;margin-top:32px}
table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}
th{background:#f2f2f2;padding:6px;text-align:left;border:1px solid #ddd;font-family:Archivo,sans-serif;text-transform:uppercase;font-size:10px;letter-spacing:0.1em}
td{padding:6px;border:1px solid #ddd;vertical-align:top}
.num{color:#006B68;font-family:monospace;font-size:11px;margin-right:8px}</style></head><body>
<h2>${meeting.name}</h2>
<p style="color:#999;font-family:monospace;font-size:11px">KIR Construcciones S.R.L. · ${fmtDate(meeting.date)} · ${meeting.time}</p>
<h3><span class="num">01</span>Asistentes</h3><p>${asistentes.map((p) => p.name + " (" + p.initials + ")").join(" · ")}</p>
<h3><span class="num">02</span>Resumen ejecutivo</h3><p>${analysis.executiveSummary || "—"}</p>
<h3><span class="num">03</span>Tareas</h3><table><thead><tr><th>#</th><th>Tarea</th><th>Resp.</th><th>Plazo</th></tr></thead><tbody>
${analysis.tasks.map((t: any, i: number) => `<tr><td>${i + 1}</td><td>${t.text}</td><td><b>${t.responsible || "Pendiente"}</b></td><td>${t.deadline || "Por definir"}</td></tr>`).join("")}
</tbody></table>
</body></html>`;
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
  { num: "09", cat: "Dashboard", title: "Panel histórico + tendencias", desc: "Dashboard de tareas recurrentes no cumplidas, tendencias de riesgos por área, productividad de seguimiento.", tags: ["BI", "Trends"] },
  { num: "10", cat: "Automation", title: "Follow-up automático", desc: "Recordatorios 48hs antes del plazo. Pre-armado de próxima minuta con compromisos abiertos. Inbox Zero para tareas pendientes.", tags: ["CRON", "Email"] },
];

export function ImprovementsStage({ onBack }: { onBack: () => void }) {
  const reset = useStore((s) => s.reset);
  return (
    <>
      <SectionHead
        eyebrow="Stage D.01 · Roadmap"
        title="Mejoras sugeridas"
        subtitle="10 áreas de evolución para llevar este producto a estándar enterprise. Cada una mantiene la identidad KIR y se integra al stack existente."
        meta={{ num: "D.01", label: "Roadmap" }}
      />

      <div className="grid grid-cols-2 gap-4">
        {IMPROVEMENTS.map((i) => (
          <div key={i.num} className="bg-white border border-kir-negro p-5">
            <div className="font-mono text-[11px] text-kir-teal mb-1">»» D.01.{i.num} · {i.cat}</div>
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
