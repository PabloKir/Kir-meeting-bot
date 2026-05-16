"use client";

import { useStore } from "@/lib/store";
import { AREAS } from "@/lib/areas";
import {
  SectionHead,
  BracketedCard,
  CardHead,
  Button,
  Chev,
} from "./Brand";

const TIPOS = ["seguimiento", "decisión", "planificación", "retrospectiva", "comité", "cliente", "interna", "otra"];
const FORMALIDADES = ["institucional", "ejecutiva", "operativa", "informal"];
const RESULTADOS = ["decisiones", "tareas", "acuerdos", "riesgos", "próximos pasos"];

export function SetupStage({ onNext }: { onNext: () => void }) {
  const meeting = useStore((s) => s.meeting);
  const setMeeting = useStore((s) => s.setMeeting);
  const loadSample = useStore((s) => s.loadSample);
  const reset = useStore((s) => s.reset);
  const markDone = useStore((s) => s.markDone);

  const next = () => {
    if (!meeting.name.trim()) return alert("Falta el nombre de la reunión");
    if (!meeting.area.trim()) return alert("Seleccioná el área de la reunión");
    if (!meeting.objective.trim()) return alert("Falta el objetivo principal");
    markDone("setup");
    onNext();
  };

  return (
    <>
      <SectionHead
        eyebrow="Stage A.01 · Preparación"
        title="Datos de la reunión"
        subtitle="Información inicial que será usada por el agente para estructurar la minuta. Todos los campos son editables luego."
        meta={{ num: "A.01", label: "FOG · Setup" }}
      />

      <BracketedCard>
        <CardHead title="Cabecera · Identificación" id="FOG-11 / 01" />

        <Field label="Nombre de la reunión" required>
          <input
            type="text"
            className="kir-input"
            value={meeting.name}
            onChange={(e) => setMeeting({ name: e.target.value })}
            placeholder="Ej: Comité gerencial — seguimiento operativo abril 2026"
          />
        </Field>

        <div className="grid grid-cols-3 gap-5">
          <Field label="Fecha">
            <input type="date" className="kir-input" value={meeting.date} onChange={(e) => setMeeting({ date: e.target.value })} />
          </Field>
          <Field label="Hora">
            <input type="time" className="kir-input" value={meeting.time} onChange={(e) => setMeeting({ time: e.target.value })} />
          </Field>
          <Field label="Duración estimada (min)">
            <input type="number" className="kir-input" min={15} step={15} value={meeting.expectedDuration} onChange={(e) => setMeeting({ expectedDuration: e.target.value })} />
          </Field>
        </div>

        <Field label="Área" required help="Lista cerrada para permitir seguimiento por área en el dashboard.">
          <select
            className="kir-input"
            value={meeting.area}
            onChange={(e) => setMeeting({ area: e.target.value })}
          >
            <option value="">— Seleccionar área —</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            {meeting.area && !(AREAS as readonly string[]).includes(meeting.area) && (
              <option value={meeting.area}>{meeting.area} (histórico)</option>
            )}
          </select>
        </Field>

        <Field label="Objetivo principal" required>
          <textarea
            className="kir-input min-h-[80px] resize-y"
            value={meeting.objective}
            onChange={(e) => setMeeting({ objective: e.target.value })}
            placeholder="¿Cuál es el resultado concreto que esta reunión debe producir?"
          />
        </Field>

        <CardHead title="Tipo y formalidad" id="FOG-11 / 02" />

        <Field label="Tipo de reunión">
          <Chips values={TIPOS} current={[meeting.type]} onToggle={(v) => setMeeting({ type: v })} />
        </Field>

        <Field label="Nivel de formalidad de la minuta">
          <Chips values={FORMALIDADES} current={[meeting.formality]} onToggle={(v) => setMeeting({ formality: v })} />
        </Field>

        <Field label="Resultado esperado (multi-selección)">
          <Chips
            values={RESULTADOS}
            current={meeting.expectedResults}
            multi
            onToggle={(v) => {
              const arr = meeting.expectedResults.includes(v)
                ? meeting.expectedResults.filter((x) => x !== v)
                : [...meeting.expectedResults, v];
              setMeeting({ expectedResults: arr });
            }}
          />
        </Field>
      </BracketedCard>

      <Actions
        left={
          <>
            <Button variant="ghost" onClick={loadSample}>
              Cargar datos de ejemplo
            </Button>
            <Button variant="ghost" onClick={() => { if (confirm("¿Reiniciar todo?")) reset(); }}>
              Reiniciar
            </Button>
          </>
        }
        right={
          <Button variant="primary" onClick={next}>
            Continuar a participantes <Chev className="text-white" />
          </Button>
        }
      />
    </>
  );
}

export function Field({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label className="kir-label">
        {label}
        {required && <span className="ml-1 text-kir-teal">»»</span>}
      </label>
      {children}
      {help && <div className="text-xs text-kir-gris mt-1">{help}</div>}
    </div>
  );
}

export function Chips({
  values,
  current,
  onToggle,
  multi = false,
}: {
  values: string[];
  current: string[];
  onToggle: (v: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => {
        const active = current.includes(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onToggle(v)}
            className={`kir-chip ${active ? "active" : ""}`}
          >
            <span className="chev">»</span>
            {v}
          </button>
        );
      })}
    </div>
  );
}

export function Actions({
  left,
  right,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 justify-between items-center mt-8 pt-6 border-t border-kir-negro">
      <div className="flex gap-3">{left}</div>
      <div className="flex gap-3">{right}</div>
    </div>
  );
}
