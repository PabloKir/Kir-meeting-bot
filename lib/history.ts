// =============================================================================
// History — persistencia de minutas pasadas en localStorage del browser
// =============================================================================
// Cada vez que el usuario llega al stage Minuta con un analisis cargado, la
// minuta queda guardada localmente. Despues puede:
// - Verla en el stage Historial (D.02)
// - Cargarla de vuelta al editor / minuta para re-exportar PDF
// - Eliminarla
//
// Limitaciones: localStorage es por browser. Si el usuario usa Chrome y luego
// Firefox, no comparte historial. Maximo ~5MB total. Para multi-device hay que
// migrar a Vercel KV / Postgres en una iteracion futura.
// =============================================================================

import type { Analysis, Meeting, Participant } from "./types";

const STORAGE_KEY = "kir-meeting-agent.history.v1";

export interface StoredMeeting {
  id: string;
  savedAt: number;
  meeting: Meeting;
  participants: Participant[];
  analysis: Analysis;
  utteranceCount: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): StoredMeeting[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredMeeting[];
  } catch {
    return [];
  }
}

function writeAll(items: StoredMeeting[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("history: failed to write localStorage", e);
  }
}

function genId(): string {
  if (isBrowser() && "crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

export function listMeetings(): StoredMeeting[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

export function getMeeting(id: string): StoredMeeting | null {
  return readAll().find((m) => m.id === id) || null;
}

export function deleteMeeting(id: string): void {
  writeAll(readAll().filter((m) => m.id !== id));
}

export function clearAllMeetings(): void {
  writeAll([]);
}

// Guarda o actualiza una minuta. Usa un fingerprint (nombre + fecha + hora) para
// evitar duplicados si el usuario navega a/desde el stage Minuta varias veces
// en la misma sesion.
export function saveOrUpdateMeeting(
  data: Omit<StoredMeeting, "id" | "savedAt">
): StoredMeeting {
  const all = readAll();
  const fingerprint = (m: Meeting) => `${m.name}|${m.date}|${m.time}`;
  const fp = fingerprint(data.meeting);
  const idx = all.findIndex((m) => fingerprint(m.meeting) === fp);
  const now = Date.now();
  if (idx >= 0) {
    const updated: StoredMeeting = { ...all[idx], ...data, savedAt: now };
    all[idx] = updated;
    writeAll(all);
    return updated;
  }
  const created: StoredMeeting = { id: genId(), savedAt: now, ...data };
  all.push(created);
  writeAll(all);
  return created;
}
