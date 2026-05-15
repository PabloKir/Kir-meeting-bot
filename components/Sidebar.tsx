"use client";

import { useStore } from "@/lib/store";
import type { Stage } from "@/lib/types";
import { Chev } from "./Brand";

const GROUPS: { title: string; stages: { id: Stage; num: string; label: string }[] }[] = [
  {
    title: "A · Preparación",
    stages: [
      { id: "setup",        num: "A.01", label: "Datos reunión" },
      { id: "participants", num: "A.02", label: "Participantes" },
    ],
  },
  {
    title: "B · Reunión activa",
    stages: [
      { id: "capture",  num: "B.01", label: "Captura" },
      { id: "speakers", num: "B.02", label: "Mapear voces" },
      { id: "analysis", num: "B.03", label: "Análisis IA" },
      { id: "questions", num: "B.04", label: "Preguntas" },
    ],
  },
  {
    title: "C · Cierre",
    stages: [
      { id: "closure", num: "C.01", label: "Validación" },
      { id: "minute",  num: "C.02", label: "Minuta final" },
    ],
  },
  {
    title: "D · Histórico y mejoras",
    stages: [
      { id: "history",      num: "D.01", label: "Historial" },
      { id: "improvements", num: "D.02", label: "Mejoras" },
    ],
  },
];

export function Sidebar() {
  const stage = useStore((s) => s.stage);
  const done = useStore((s) => s.done);
  const setStage = useStore((s) => s.setStage);

  return (
    <aside className="border-r border-kir-negro bg-white overflow-y-auto py-6 row-span-1">
      {GROUPS.map((g) => (
        <div className="mb-6" key={g.title}>
          <div
            className="font-display uppercase text-kir-gris px-6 pb-2 flex items-center gap-1.5"
            style={{ fontSize: 9, letterSpacing: "0.22em" }}
          >
            <Chev />
            {g.title}
          </div>
          {g.stages.map((s) => {
            const isActive = stage === s.id;
            const isDone = done[s.id];
            return (
              <div
                key={s.id}
                onClick={() => setStage(s.id)}
                className={`grid grid-cols-[44px_1fr_auto] items-center px-6 py-3 cursor-pointer transition-colors border-l-[3px] ${
                  isActive
                    ? "border-kir-teal bg-kir-gris-papel"
                    : "border-transparent hover:bg-kir-gris-papel"
                }`}
              >
                <span
                  className={`font-mono ${isDone ? "text-kir-teal" : "text-kir-gris"}`}
                  style={{ fontSize: 11 }}
                >
                  {s.num}
                </span>
                <span
                  className="font-display font-bold"
                  style={{ fontSize: 13, letterSpacing: "-0.01em" }}
                >
                  {s.label}
                </span>
                {isDone && (
                  <span
                    className="font-display font-black text-kir-teal"
                    style={{ fontSize: 10, letterSpacing: "-0.1em" }}
                  >
                    »»
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
