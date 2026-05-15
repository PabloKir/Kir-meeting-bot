"use client";

import { create } from "zustand";
import type {
  Analysis,
  AgentQuestion,
  Capture,
  Meeting,
  Participant,
  SpeakerMap,
  Stage,
  Task,
  Utterance,
} from "./types";

interface AppState {
  stage: Stage;
  meeting: Meeting;
  participants: Participant[];
  capture: Capture;
  analysis: Analysis;
  questions: AgentQuestion[];
  done: Record<Stage, boolean>;

  // Actions
  setStage: (s: Stage) => void;
  setMeeting: (m: Partial<Meeting>) => void;
  setParticipants: (p: Participant[]) => void;
  upsertParticipant: (p: Participant) => void;
  removeParticipant: (id: string) => void;
  setCapture: (c: Partial<Capture>) => void;
  setSpeakerMap: (m: SpeakerMap) => void;
  setAnalysis: (a: Analysis) => void;
  updateTask: (i: number, t: Partial<Task>) => void;
  addTask: (t: Task) => void;
  removeTask: (i: number) => void;
  setQuestions: (q: AgentQuestion[]) => void;
  answerQuestion: (id: string, answer: string, custom?: string) => void;
  markDone: (s: Stage, v?: boolean) => void;
  loadSample: () => void;
  reset: () => void;
}

const emptyMeeting: Meeting = {
  name: "",
  date: new Date().toISOString().slice(0, 10),
  time: new Date().toTimeString().slice(0, 5),
  area: "",
  objective: "",
  type: "seguimiento",
  formality: "institucional",
  expectedDuration: "60",
  expectedResults: ["decisiones", "tareas"],
};

const emptyCapture: Capture = {
  status: "idle",
  startTime: null,
  elapsed: 0,
  audioUrl: null,
  audioBlob: null,
  utterances: [],
  speakerMap: {},
  manualNotes: "",
  transcribeJobId: null,
  errorMsg: null,
};

const emptyAnalysis: Analysis = {
  executiveSummary: "",
  topics: [],
  decisions: [],
  tasks: [],
  risks: [],
  openQuestions: [],
  nextSteps: [],
};

const emptyDone = {
  setup: false,
  participants: false,
  capture: false,
  speakers: false,
  analysis: false,
  questions: false,
  closure: false,
  minute: false,
  improvements: false,
} as Record<Stage, boolean>;

// Datos de ejemplo basados en minutas reales de KIR (FOG-11 + minutas operativas)
const SAMPLE_PARTICIPANTS: Participant[] = [
  { id: "p1", name: "Pablo Kirchheimer",     initials: "PK", role: "Responsable de decisión", canBeResponsible: true,  attended: true },
  { id: "p2", name: "Diego Nemi",             initials: "DN", role: "Participante",            canBeResponsible: true,  attended: true },
  { id: "p3", name: "Ximena Hernández",       initials: "XH", role: "Facilitador",             canBeResponsible: true,  attended: true },
  { id: "p4", name: "Hernando Haritchabalet", initials: "HH", role: "Participante",            canBeResponsible: true,  attended: true },
  { id: "p5", name: "Florencia Rey",          initials: "FR", role: "Participante",            canBeResponsible: true,  attended: true },
  { id: "p6", name: "Marcelo Santos",         initials: "MS", role: "Participante",            canBeResponsible: true,  attended: false },
];

const SAMPLE_MEETING: Meeting = {
  name: "Comité gerencial — seguimiento operativo",
  date: new Date().toISOString().slice(0, 10),
  time: "10:00",
  area: "Gerencia / Operaciones",
  objective: "Revisar avance de obras, proyección de caja y desvíos del mes",
  type: "seguimiento",
  formality: "institucional",
  expectedDuration: "90",
  expectedResults: ["decisiones", "tareas", "riesgos"],
};

// Transcripción de ejemplo con diarización ya hecha (para probar sin tener API key)
const SAMPLE_UTTERANCES: Utterance[] = [
  { speaker: "A", text: "Buenos días a todos. Abrimos el comité con la revisión de caja. Diego, ¿cómo venimos con las certificaciones de abril?", start: 0, end: 8000, confidence: 0.95 },
  { speaker: "B", text: "Tenemos un atraso en la certificación de Migraciones. Se decide acelerar la certificación con cliente para esta semana. Florencia tiene que coordinar con Servicios el diferimiento de pagos a proveedores no críticos.", start: 8500, end: 22000, confidence: 0.93 },
  { speaker: "C", text: "Hay un riesgo importante: el dashboard de avance de obras está desactualizado. Eso compromete el forecast. Pedro tiene que actualizarlo antes del 29 de abril.", start: 22500, end: 35000, confidence: 0.94 },
  { speaker: "A", text: "Es crítico. Marcelo, también necesitamos avanzar con la revisión del proceso de selección de jornalizados, hubo 74 salidas en marzo. Hablalo con RRHH.", start: 35500, end: 48000, confidence: 0.92 },
  { speaker: "D", text: "Una duda: ¿el stop de pagos aplica a todos los proveedores o hay excepciones?", start: 48500, end: 55000, confidence: 0.96 },
  { speaker: "A", text: "Hay excepciones, pero las tenemos que definir. Florencia, armá el listado de proveedores críticos para el viernes.", start: 55500, end: 65000, confidence: 0.94 },
  { speaker: "B", text: "Sobre el portfolio de prospectos, todavía no tengo los números cerrados. Lo presento en la próxima reunión.", start: 65500, end: 75000, confidence: 0.93 },
  { speaker: "C", text: "Bien, próxima reunión miércoles 29. Cierro la minuta y la circulo.", start: 75500, end: 82000, confidence: 0.95 },
];

const SAMPLE_SPEAKER_MAP: SpeakerMap = {
  A: "p1", // Pablo
  B: "p2", // Diego
  C: "p3", // Ximena
  D: "p4", // Hernando
};

export const useStore = create<AppState>((set, get) => ({
  stage: "setup",
  meeting: { ...emptyMeeting },
  participants: [],
  capture: { ...emptyCapture },
  analysis: { ...emptyAnalysis },
  questions: [],
  done: { ...emptyDone },

  setStage: (s) => set({ stage: s }),
  setMeeting: (m) => set((st) => ({ meeting: { ...st.meeting, ...m } })),
  setParticipants: (p) => set({ participants: p }),
  upsertParticipant: (p) =>
    set((st) => {
      const idx = st.participants.findIndex((x) => x.id === p.id);
      const arr = [...st.participants];
      if (idx >= 0) arr[idx] = p;
      else arr.push(p);
      return { participants: arr };
    }),
  removeParticipant: (id) =>
    set((st) => ({ participants: st.participants.filter((p) => p.id !== id) })),

  setCapture: (c) => set((st) => ({ capture: { ...st.capture, ...c } })),
  setSpeakerMap: (m) =>
    set((st) => ({ capture: { ...st.capture, speakerMap: m } })),

  setAnalysis: (a) => set({ analysis: a }),
  updateTask: (i, t) =>
    set((st) => {
      const tasks = [...st.analysis.tasks];
      tasks[i] = { ...tasks[i], ...t };
      return { analysis: { ...st.analysis, tasks } };
    }),
  addTask: (t) =>
    set((st) => ({
      analysis: { ...st.analysis, tasks: [...st.analysis.tasks, t] },
    })),
  removeTask: (i) =>
    set((st) => ({
      analysis: {
        ...st.analysis,
        tasks: st.analysis.tasks.filter((_, idx) => idx !== i),
      },
    })),

  setQuestions: (q) => set({ questions: q }),
  answerQuestion: (id, answer, custom = "") =>
    set((st) => ({
      questions: st.questions.map((q) =>
        q.id === id ? { ...q, answer, custom } : q
      ),
    })),

  markDone: (s, v = true) =>
    set((st) => ({ done: { ...st.done, [s]: v } })),

  loadSample: () =>
    set({
      meeting: { ...SAMPLE_MEETING },
      participants: SAMPLE_PARTICIPANTS.map((p) => ({ ...p })),
      capture: {
        ...emptyCapture,
        status: "transcribed",
        utterances: [...SAMPLE_UTTERANCES],
        speakerMap: { ...SAMPLE_SPEAKER_MAP },
      },
    }),

  reset: () =>
    set({
      stage: "setup",
      meeting: { ...emptyMeeting },
      participants: [],
      capture: { ...emptyCapture },
      analysis: { ...emptyAnalysis },
      questions: [],
      done: { ...emptyDone },
    }),
}));

export { SAMPLE_PARTICIPANTS, SAMPLE_MEETING, SAMPLE_UTTERANCES, SAMPLE_SPEAKER_MAP };
