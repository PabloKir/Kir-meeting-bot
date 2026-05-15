"use client";

import { useStore } from "@/lib/store";
import {
  SectionHead,
  BracketedCard,
  CardHead,
  Button,
  Chev,
  Alert,
} from "./Brand";
import { Actions } from "./Setup";
import type { Participant, ParticipantRole } from "@/lib/types";

const ROLES: ParticipantRole[] = [
  "Facilitador",
  "Responsable de decisión",
  "Participante",
  "Invitado",
  "Cliente",
  "Observador",
];

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "??";
}

export function ParticipantsStage({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  const participants = useStore((s) => s.participants);
  const setParticipants = useStore((s) => s.setParticipants);
  const upsertParticipant = useStore((s) => s.upsertParticipant);
  const removeParticipant = useStore((s) => s.removeParticipant);
  const markDone = useStore((s) => s.markDone);

  const update = (id: string, patch: Partial<Participant>) => {
    const p = participants.find((x) => x.id === id);
    if (!p) return;
    const next = { ...p, ...patch };
    if (patch.name !== undefined) next.initials = initialsOf(patch.name);
    upsertParticipant(next);
  };

  const add = () => {
    const id = "p" + Date.now();
    upsertParticipant({
      id,
      name: "",
      initials: "",
      role: "Participante",
      canBeResponsible: true,
      attended: true,
    });
  };

  const handleNext = () => {
    const valid = participants.filter((p) => p.name.trim().length > 0);
    if (valid.length < 2) return alert("Cargá al menos 2 participantes");
    setParticipants(valid);
    markDone("participants");
    onNext();
  };

  return (
    <>
      <SectionHead
        eyebrow="Stage A.02 · Preparación"
        title="Participantes"
        subtitle="Listá quienes asisten, su rol y si pueden ser responsables de tareas. El agente solo asignará tareas a quienes estén marcados como responsables habilitados."
        meta={{ num: "A.02", label: "FOG · Asistentes" }}
      />

      <BracketedCard>
        <CardHead title={`Lista de asistentes (${participants.length})`} id="FOG-11 / 03" />

        <div className="grid grid-cols-[40px_1fr_200px_140px_90px_40px] gap-3 font-display uppercase text-kir-gris border-b border-kir-negro pb-2 mb-2" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
          <div />
          <div>Nombre y apellido</div>
          <div>Rol</div>
          <div>Asignable</div>
          <div>Asiste</div>
          <div />
        </div>

        {participants.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-[40px_1fr_200px_140px_90px_40px] gap-3 items-center py-3 border-b border-kir-gris-border"
          >
            <div
              className={`w-8 h-8 border border-kir-negro flex items-center justify-center font-display font-extrabold text-xs ${
                p.attended ? "bg-kir-negro text-white" : ""
              }`}
              style={{ letterSpacing: "-0.02em" }}
            >
              {p.initials || initialsOf(p.name) || "??"}
            </div>
            <input
              type="text"
              className="kir-input"
              style={{ padding: "6px 8px", fontSize: 13 }}
              value={p.name}
              onChange={(e) => update(p.id, { name: e.target.value })}
              placeholder="Nombre y apellido"
            />
            <select
              className="kir-input"
              style={{ padding: "6px 8px", fontSize: 13 }}
              value={p.role}
              onChange={(e) => update(p.id, { role: e.target.value as ParticipantRole })}
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 cursor-pointer font-display uppercase font-semibold" style={{ fontSize: 11, letterSpacing: "0.12em" }}>
              <input
                type="checkbox"
                checked={p.canBeResponsible}
                onChange={(e) => update(p.id, { canBeResponsible: e.target.checked })}
                style={{ accentColor: "#006B68" }}
              />
              Responsable
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer font-display uppercase font-semibold" style={{ fontSize: 11, letterSpacing: "0.12em" }}>
              <input
                type="checkbox"
                checked={p.attended}
                onChange={(e) => update(p.id, { attended: e.target.checked })}
                style={{ accentColor: "#006B68" }}
              />
              Sí
            </label>
            <button
              onClick={() => removeParticipant(p.id)}
              className="bg-transparent border border-kir-gris-border cursor-pointer text-kir-gris hover:text-kir-rojo hover:border-kir-rojo px-2 py-1 text-base"
            >
              ×
            </button>
          </div>
        ))}

        <div className="mt-5">
          <Button variant="ghost" onClick={add}>
            Agregar participante <Chev />
          </Button>
        </div>
      </BracketedCard>

      <Alert title="Aviso de consentimiento">
        Antes de iniciar la captura, asegurate de que todos los participantes están informados de que la reunión será grabada y transcripta. Es responsabilidad del facilitador comunicarlo al inicio.
      </Alert>

      <Actions
        left={
          <Button variant="ghost" onClick={onBack}>
            «« Volver
          </Button>
        }
        right={
          <Button variant="primary" onClick={handleNext}>
            Iniciar reunión <Chev className="text-white" />
          </Button>
        }
      />
    </>
  );
}
