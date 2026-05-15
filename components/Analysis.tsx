"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { SectionHead, Button, Chev, Tag, Alert } from "./Brand";
import { Actions } from "./Setup";

export function AnalysisStage({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const capture = useStore((s) => s.capture);
  const meeting = useStore((s) => s.meeting);
  const participants = useStore((s) => s.participants);
  const analysis = useStore((s) => s.analysis);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setQuestions = useStore((s) => s.setQuestions);
  const markDone = useStore((s) => s.markDone);
  const questions = useStore((s) => s.questions);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasResult = analysis.topics.length + analysis.decisions.length + analysis.tasks.length > 0;

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meeting,
          participants,
          utterances: capture.utterances,
          speakerMap: capture.speakerMap,
          manualNotes: capture.manualNotes,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAnalysis(data.analysis);
      setQuestions(data.questions || []);
      markDone("analysis");
    } catch (e: any) {
      setError(e.message || "Error en análisis");
    } finally {
      setLoading(false);
    }
  };

  // Auto-run on first arrival
  useEffect(() => {
    if (!hasResult && !loading && !error) {
      runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = analysis.topics.length + analysis.decisions.length + analysis.tasks.length + analysis.risks.length + analysis.openQuestions.length + analysis.nextSteps.length;

  return (
    <>
      <SectionHead
        eyebrow="Stage B.03 · Análisis IA"
        title="Agente · Claude Sonnet 4.6"
        subtitle="Claude analizó la transcripción atribuida y la estructuró en temas, decisiones, tareas (con responsable inferido del contexto), riesgos y próximos pasos."
        meta={{ num: "B.03", label: loading ? "Procesando…" : `${total} ítems` }}
      />

      {error && (
        <Alert variant="warn" title="Error en análisis">
          {error}
          <div className="mt-2">
            <Button variant="ghost" size="sm" onClick={runAnalysis}>Reintentar</Button>
          </div>
        </Alert>
      )}

      {loading && (
        <div className="bg-white border border-kir-negro p-12 text-center">
          <div className="font-display uppercase text-kir-gris mb-3" style={{ fontSize: 10, letterSpacing: "0.22em" }}>
            <Chev /> Analizando con Claude
          </div>
          <div className="font-display font-black text-2xl uppercase kir-blink" style={{ letterSpacing: "-0.02em" }}>
            Procesando transcripción
          </div>
          <div className="text-kir-gris text-sm mt-3">
            Claude está leyendo la transcripción atribuida y estructurando la información…
          </div>
        </div>
      )}

      {hasResult && !loading && (
        <div className="grid grid-cols-2 gap-4">
          <AnalysisBlock title="Resumen ejecutivo" items={[analysis.executiveSummary].filter(Boolean)} span={2} />
          <AnalysisBlock title="Temas tratados" items={analysis.topics} />
          <AnalysisBlock title="Decisiones tomadas" items={analysis.decisions} />
          <AnalysisBlock
            title={`Tareas detectadas (${analysis.tasks.length})`}
            span={2}
            customItems={analysis.tasks.map((t, i) => (
              <li key={i} className="pl-5 py-2 border-b border-kir-gris-border last:border-0 relative">
                <span className="absolute left-0 top-2 font-display font-black text-kir-teal" style={{ letterSpacing: "-0.1em" }}>»</span>
                <div className="flex justify-between gap-3 flex-wrap">
                  <span className="flex-1 min-w-[280px] text-sm">{t.text}</span>
                  <span className="flex gap-1.5 flex-wrap">
                    {t.responsible ? <Tag variant="teal">»» {t.responsible}</Tag> : <Tag variant="alta">SIN RESP.</Tag>}
                    {t.deadline ? <Tag>{t.deadline}</Tag> : <Tag variant="alta">SIN PLAZO</Tag>}
                    <Tag variant={t.priority === "Alta" ? "alta" : t.priority === "Baja" ? "baja" : "media"}>{t.priority}</Tag>
                  </span>
                </div>
              </li>
            ))}
          />
          <AnalysisBlock
            title={`Riesgos (${analysis.risks.length})`}
            customItems={analysis.risks.map((r, i) => (
              <li key={i} className="pl-5 py-2 border-b border-kir-gris-border last:border-0 relative">
                <span className="absolute left-0 top-2 font-display font-black text-kir-teal" style={{ letterSpacing: "-0.1em" }}>»</span>
                <div className="text-sm">{r.text}</div>
                <div className="mt-1 flex gap-2">
                  <Tag variant={r.level === "Alta" ? "alta" : r.level === "Baja" ? "baja" : "media"}>{r.level}</Tag>
                  {r.mitigation && <span className="text-xs text-kir-gris italic">Mitigación: {r.mitigation}</span>}
                </div>
              </li>
            ))}
          />
          <AnalysisBlock title="Preguntas abiertas" items={analysis.openQuestions} />
          <AnalysisBlock title="Próximos pasos" items={analysis.nextSteps} span={2} />
        </div>
      )}

      {questions.length > 0 && (
        <Alert>
          <b>{questions.length} preguntas requieren tu confirmación.</b> El agente detectó información incompleta o ambigua. Resolvelas con multiple choice en el próximo paso.
        </Alert>
      )}

      <Actions
        left={
          <>
            <Button variant="ghost" onClick={onBack}>«« Volver</Button>
            {hasResult && <Button variant="ghost" onClick={runAnalysis} disabled={loading}>Re-analizar</Button>}
          </>
        }
        right={
          hasResult && (
            <Button variant="primary" onClick={onNext}>
              {questions.length > 0 ? "Responder preguntas" : "Ir a cierre"} <Chev className="text-white" />
            </Button>
          )
        }
      />
    </>
  );
}

function AnalysisBlock({
  title,
  items = [],
  customItems,
  span = 1,
}: {
  title: string;
  items?: string[];
  customItems?: React.ReactNode;
  span?: 1 | 2;
}) {
  return (
    <div
      className="bg-white border border-kir-negro p-5"
      style={{ gridColumn: span === 2 ? "span 2" : undefined }}
    >
      <h4
        className="font-display font-black uppercase text-sm mb-3 pb-2 border-b border-kir-gris-border flex justify-between items-baseline"
        style={{ letterSpacing: "-0.01em" }}
      >
        {title}
        {items && !customItems && <span className="font-mono text-[11px] text-kir-gris font-normal">{items.length}</span>}
      </h4>
      <ul className="list-none">
        {customItems ? (
          customItems
        ) : items.length === 0 ? (
          <li className="text-kir-gris italic text-sm">— Sin ítems —</li>
        ) : (
          items.map((it, i) => (
            <li key={i} className="pl-5 py-2 border-b border-kir-gris-border last:border-0 relative text-sm">
              <span
                className="absolute left-0 top-2 font-display font-black text-kir-teal"
                style={{ letterSpacing: "-0.1em" }}
              >
                »
              </span>
              {it}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
