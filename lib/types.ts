// =============================================================================
// KIR Meeting Agent — Tipos compartidos
// =============================================================================

export type Stage =
  | "setup"
  | "participants"
  | "capture"
  | "speakers"      // mapeo de speakers AssemblyAI ↔ participantes
  | "analysis"
  | "questions"
  | "closure"
  | "minute"
  | "improvements";

export type ParticipantRole =
  | "Facilitador"
  | "Responsable de decisión"
  | "Participante"
  | "Invitado"
  | "Cliente"
  | "Observador";

export interface Participant {
  id: string;
  name: string;
  initials: string;
  role: ParticipantRole;
  canBeResponsible: boolean;
  attended: boolean;
}

export interface Meeting {
  name: string;
  date: string;
  time: string;
  area: string;
  objective: string;
  type: string;
  formality: string;
  expectedDuration: string;
  expectedResults: string[];
}

// =============================================================================
// Transcripción con diarización (formato AssemblyAI)
// =============================================================================
export interface Utterance {
  speaker: string;     // "A", "B", "C", ...  (AssemblyAI)
  text: string;
  start: number;       // ms
  end: number;         // ms
  confidence: number;
}

export type SpeakerMap = Record<string, string>;
// "A" -> participantId | "" (unassigned)

// =============================================================================
// Análisis estructurado (output de Claude)
// =============================================================================
export interface Task {
  text: string;
  responsible: string | null;
  responsibleParticipantId?: string | null;
  deadline: string | null;
  priority: "Alta" | "Media" | "Baja";
  status: "Pendiente" | "En curso" | "Completado";
  confirmed: boolean;
  requestedBy?: string | null;  // quien encargó la tarea
}

export interface Risk {
  text: string;
  level: "Alta" | "Media" | "Baja";
  mitigation: string | null;
}

export interface Analysis {
  executiveSummary: string;
  topics: string[];
  decisions: string[];
  tasks: Task[];
  risks: Risk[];
  openQuestions: string[];
  nextSteps: string[];
}

// =============================================================================
// Preguntas que el agente genera ante ambigüedad
// =============================================================================
export interface AgentQuestion {
  id: string;
  type: "missing-responsible" | "missing-deadline" | "risk-escalation" | "tentative-decision";
  text: string;
  context: string;
  taskIndex?: number;
  riskIndex?: number;
  options: { key: string; label: string; value: string }[];
  answer: string | null;
  custom: string;
}

// =============================================================================
// Estado de captura
// =============================================================================
export type CaptureStatus =
  | "idle"
  | "recording"
  | "uploading"
  | "transcribing"
  | "transcribed"
  | "failed";

export interface Capture {
  status: CaptureStatus;
  startTime: number | null;
  elapsed: number;
  audioUrl: string | null;
  audioBlob: Blob | null;
  utterances: Utterance[];
  speakerMap: SpeakerMap;
  manualNotes: string;
  transcribeJobId: string | null;
  errorMsg: string | null;
}

// =============================================================================
// API contracts
// =============================================================================
export interface TranscribeResponse {
  jobId: string;
  status: "queued" | "processing" | "completed" | "error";
}

export interface TranscribeStatusResponse {
  status: "queued" | "processing" | "completed" | "error";
  utterances?: Utterance[];
  speakers?: string[];
  errorMsg?: string;
}

export interface AnalyzeRequest {
  meeting: Meeting;
  participants: Participant[];
  utterances: Utterance[];
  speakerMap: SpeakerMap;
  manualNotes: string;
}

export interface AnalyzeResponse {
  analysis: Analysis;
  questions: AgentQuestion[];
}
