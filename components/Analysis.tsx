"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { SectionHead, Button, Chev, Tag, Alert } from "./Brand";
import { Actions } from "./Setup";
import type { ClaudeModelChoice } from "@/lib/types";

const MODELS: { key: ClaudeModelChoice; label: string; hint: string }[] = [
  { key: "haiku", label: "Haiku", hint: "Rápido y económico · ideal reuniones largas" },
  { key: "sonnet", label: "Sonnet", hint: "Equilibrado (default)" },
  { key: "opus", label: "Opus", hint: "Máxima calidad · más lento" },
];

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
  const [elapsedSec, setElapsedSec] = useState(0);
  const [model, setModel] = useState<ClaudeModelChoice>("sonnet");
  const hasResult =
    !!analysis.executiveSummary ||
    analysis.topics.length +
      analysis.decisions.length +
      analysis.tasks.length +
      analysis.risks.length +
      analysis.openQuestions.length +
      analysis.nextSteps.length >
      0;

  // Estimacion grosera de tiempo segun tamaño del transcript
  const transcriptChars = capture.utterances.reduce((acc, u) => acc + u.text.length, 0) + capture.manualNotes.length;
  const estimatedSec = Math.max(15, Math.min(240, Math.round(transcriptChars / 250)));

  // Cronometro durante el loading
  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return;
    }
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

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
          model,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        let msg = e.error || `HTTP ${res.status}`;
        if (res.status === 504 || res.status === 408 || res.status === 502) {
          msg = "El servidor cortó la solicitud (timeout/proxy). Probá REINTENTAR — la transcripción NO se perdió, está guardada localmente.";
        }
        throw new Error(msg);
      }
      const data = await res.json();

      // Modo síncrono (sin KV): la respuesta ya trae el análisis.
      if (data.analysis) {
        setAnalysis(data.analysis);
        setQuestions(data.questions || []);
        markDone("analysis");
        return;
      }

      // Modo asíncrono: polling del job hasta completed/error.
      if (data.jobId) {
        const jobId: string = data.jobId;
        const started = Date.now();
        const MAX_MS = 6 * 60 * 1000; // tope de seguridad: 6 min
        // eslint-disable-next-line no-constant-condition
        while (true) {
          await new Promise((r) => setTimeout(r, 3000));
          if (Date.now() - started > MAX_MS) {
            throw new Error(
              "El análisis está tardando demasiado. La transcripción sigue guardada — probá REINTENTAR."
            );
          }
          let pr: Response;
          try {
            pr = await fetch(`/api/analyze/${jobId}`, { cache: "no-store" });
          } catch {
            continue; // corte de red transitorio: seguimos intentando
          }
          const pj = await pr.json().catch(() => ({}));
          if (pj.status === "completed") {
            setAnalysis(pj.analysis);
            setQuestions(pj.questions || []);
            markDone("analysis");
            return;
          }
          if (pj.status === "error" || (!pr.ok && pr.status !== 404)) {
            throw new Error(pj.error || `Error en análisis (HTTP ${pr.status})`);
          }
          if (pr.status === 404) {
            throw new Error(
              pj.error || "El trabajo expiró. Reintentá el análisis."
            );
          }
          // status === "processing" → seguir esperando
        }
      }

      throw new Error("Respuesta inesperada del servidor de análisis.");
    } catch (e: any) {
      let msg = e.message || "Error en analisis";
      // Network errors / connection drop tambien dejan la transcripcion intacta
      if (e.name === "TypeError" && /fetch/i.test(msg)) {
        msg = "Error de red durante el analisis. La transcripcion sigue guardada — reintenta cuando vuelva la conexion.";
      }
      setError(msg);
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
        title="Agente · Análisis de la reunión"
        subtitle="El modelo analiza la transcripción atribuida y la estructura en temas, decisiones, tareas (con responsable inferido del contexto), riesgos y próximos pasos."
        meta={{ num: "B.03", label: loading ? "Procesando…" : `${total} ítems` }}
      />

      <div className="bg-white border border-kir-negro p-4 mb-4 flex flex-wrap items-center gap-3">
        <span className="font-display uppercase text-kir-gris" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
          <Chev kind="single" /> Modelo
        </span>
        <div className="flex flex-wrap gap-2">
          {MODELS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setModel(m.key)}
              disabled={loading}
              title={m.hint}
              className={`kir-chip ${model === m.key ? "active" : ""}`}
            >
              <span className="chev">»</span>
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-kir-gris">
          {MODELS.find((m) => m.key === model)?.hint}
        </span>
      </div>

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
          <div className="grid grid-cols-3 gap-4 mt-6 max-w-[600px] mx-auto">
            <div className="border border-kir-gris-border p-3">
              <div className="font-display uppercase text-kir-gris text-[9px]" style={{ letterSpacing: "0.22em" }}>Transcripción</div>
              <div className="font-mono text-base mt-1">{transcriptChars.toLocaleString()} <span className="text-kir-gris text-xs">car.</span></div>
            </div>
            <div className="border border-kir-gris-border p-3">
              <div className="font-display uppercase text-kir-gris text-[9px]" style={{ letterSpacing: "0.22em" }}>Tiempo</div>
              <div className="font-mono text-base mt-1">{Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}</div>
            </div>
            <div className="border border-kir-gris-border p-3">
              <div className="font-display uppercase text-kir-gris text-[9px]" style={{ letterSpacing: "0.22em" }}>Estimado</div>
              <div className="font-mono text-base mt-1">~{Math.floor(estimatedSec / 60)}:{String(estimatedSec % 60).padStart(2, "0")}</div>
            </div>
          </div>
          <div className="text-kir-gris text-sm mt-5 max-w-[640px] mx-auto leading-relaxed">
            Claude está leyendo la transcripción atribuida y estructurando la información.
            Para transcripciones largas puede tardar hasta varios minutos. <b>Si refrescás la página, no perdés la transcripción</b> — está guardada localmente.
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

      {/* Guard: nunca pantalla en blanco. Si no hay resultado, ni carga, ni
          error → ofrecer disparar el análisis manualmente. */}
      {!hasResult && !loading && !error && (
        <div className="bg-white border border-kir-negro p-10 text-center">
          <div className="font-display uppercase text-kir-gris mb-3" style={{ fontSize: 10, letterSpacing: "0.22em" }}>
            <Chev /> Análisis no ejecutado
          </div>
          <div className="text-sm text-kir-gris mb-5 max-w-[560px] mx-auto leading-relaxed">
            Elegí el modelo arriba (para reuniones largas conviene <b>Haiku</b>) y ejecutá el análisis. La transcripción está guardada localmente — no se pierde.
          </div>
          <Button variant="primary" onClick={runAnalysis}>
            Analizar con {MODELS.find((m) => m.key === model)?.label} <Chev className="text-white" />
          </Button>
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
