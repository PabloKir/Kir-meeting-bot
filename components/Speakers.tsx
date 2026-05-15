"use client";

import { useStore } from "@/lib/store";
import { SectionHead, BracketedCard, CardHead, Button, Chev, Tag, Alert } from "./Brand";
import { Actions } from "./Setup";

export function SpeakersStage({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const capture = useStore((s) => s.capture);
  const setSpeakerMap = useStore((s) => s.setSpeakerMap);
  const participants = useStore((s) => s.participants);
  const markDone = useStore((s) => s.markDone);

  const speakers = Array.from(new Set(capture.utterances.map((u) => u.speaker))).sort();
  const attendees = participants.filter((p) => p.attended);

  const assign = (speaker: string, pid: string) => {
    setSpeakerMap({ ...capture.speakerMap, [speaker]: pid });
  };

  const samplesFor = (speaker: string) =>
    capture.utterances.filter((u) => u.speaker === speaker).slice(0, 2);

  const allAssigned = speakers.every((s) => capture.speakerMap[s]);

  const handleNext = () => {
    markDone("speakers");
    onNext();
  };

  if (speakers.length === 0) {
    return (
      <>
        <SectionHead
          eyebrow="Stage B.02 · Mapeo de voces"
          title="Sin voces para mapear"
          subtitle="No hay transcripción con diarización. Pasamos directo al análisis."
          meta={{ num: "B.02", label: "Skip" }}
        />
        <Actions
          left={<Button variant="ghost" onClick={onBack}>«« Volver a captura</Button>}
          right={<Button variant="primary" onClick={handleNext}>Continuar <Chev className="text-white" /></Button>}
        />
      </>
    );
  }

  return (
    <>
      <SectionHead
        eyebrow="Stage B.02 · Diarización"
        title="Mapear voces → personas"
        subtitle="AssemblyAI detectó los hablantes pero solo los etiqueta como A, B, C… Asignalos a los participantes reales. El agente usa esto para atribuir tareas y decisiones correctamente."
        meta={{ num: "B.02", label: `${speakers.length} voces detectadas` }}
      />

      {!allAssigned && (
        <Alert>
          Asigná cada voz detectada a un participante para que el agente pueda atribuir correctamente las tareas en el análisis.
        </Alert>
      )}

      <BracketedCard>
        <CardHead title="Voces detectadas" id="FOG-11 / 05" />

        <div className="space-y-5">
          {speakers.map((speaker) => {
            const samples = samplesFor(speaker);
            const assignedTo = capture.speakerMap[speaker];
            return (
              <div key={speaker} className="grid grid-cols-[100px_1fr_280px] gap-4 items-start py-3 border-b border-kir-gris-border">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 border border-kir-negro bg-kir-negro text-white flex items-center justify-center font-display font-black text-xl">
                    {speaker}
                  </div>
                  <Tag variant="teal">Voz {speaker}</Tag>
                </div>
                <div className="text-sm space-y-2">
                  <div className="font-display uppercase text-kir-gris" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
                    Muestras de lo que dijo:
                  </div>
                  {samples.map((s, i) => (
                    <div key={i} className="italic text-kir-negro text-[13px] leading-relaxed border-l-2 border-kir-teal pl-3">
                      "{s.text.length > 200 ? s.text.slice(0, 200) + "…" : s.text}"
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-display uppercase text-kir-gris mb-2" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
                    Asignar a:
                  </div>
                  <select
                    className="kir-input"
                    value={assignedTo || ""}
                    onChange={(e) => assign(speaker, e.target.value)}
                  >
                    <option value="">— Sin asignar —</option>
                    {attendees.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.initials})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </BracketedCard>

      <Actions
        left={<Button variant="ghost" onClick={onBack}>«« Volver a captura</Button>}
        right={
          <Button variant="primary" onClick={handleNext} disabled={!allAssigned}>
            {allAssigned ? "Analizar con Claude" : `Falta asignar ${speakers.filter(s => !capture.speakerMap[s]).length} voces`}
            <Chev className="text-white" />
          </Button>
        }
      />
    </>
  );
}
