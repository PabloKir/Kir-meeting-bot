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
  // Best-effort: borrar tambien del servidor compartido
  void fetch(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
    () => {}
  );
}

export function clearAllMeetings(): void {
  writeAll([]);
}

// =============================================================================
// Sync con el servidor (Vercel KV). El servidor es la fuente compartida entre
// dominios/dispositivos; localStorage es cache local + modo offline.
// =============================================================================

// Empuja una minuta al servidor (fire-and-forget; no bloquea la UI).
function pushMeetingToServer(m: StoredMeeting): void {
  void fetch("/api/history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meeting: m }),
  }).catch(() => {});
}

// Trae el historial del servidor, lo mergea en localStorage (por id, gana el
// savedAt mas reciente) y devuelve la lista combinada ya ordenada.
// Si el server no tiene KV configurado o falla, devuelve solo lo local.
export async function syncFromServer(): Promise<StoredMeeting[]> {
  try {
    const res = await fetch("/api/history", { cache: "no-store" });
    if (!res.ok) return listMeetings();
    const data = await res.json();
    if (!data?.configured || !Array.isArray(data.meetings)) {
      return listMeetings();
    }
    const local = readAll();
    const byId = new Map<string, StoredMeeting>();
    local.forEach((m) => byId.set(m.id, m));
    for (const m of data.meetings as StoredMeeting[]) {
      if (!m?.id) continue;
      const existing = byId.get(m.id);
      if (!existing || (m.savedAt || 0) >= (existing.savedAt || 0)) {
        byId.set(m.id, m);
      }
    }
    const merged = Array.from(byId.values());
    writeAll(merged);

    // Empujar al server cualquier minuta local que el server no tenga aun
    const serverIds = new Set((data.meetings as StoredMeeting[]).map((m) => m.id));
    for (const m of local) {
      if (!serverIds.has(m.id)) pushMeetingToServer(m);
    }

    return merged.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return listMeetings();
  }
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
    pushMeetingToServer(updated);
    return updated;
  }
  const created: StoredMeeting = { id: genId(), savedAt: now, ...data };
  all.push(created);
  writeAll(all);
  pushMeetingToServer(created);
  return created;
}

// =============================================================================
// Export / Import — backup manual del historial como archivo JSON
// =============================================================================
// Permite mover el historial entre navegadores/dominios/dispositivos sin
// depender del servidor, y tener un respaldo offline.

const EXPORT_VERSION = 1;

export function exportHistoryJSON(): string {
  const payload = {
    app: "kir-meeting-agent",
    kind: "history-backup",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    meetings: readAll(),
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
}

// Importa un backup mergeando con lo que ya hay. Dedupe por id; si un id ya
// existe se queda con el de savedAt mas reciente.
export function importHistoryJSON(jsonText: string): ImportResult {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("El archivo no es un JSON valido.");
  }
  const incoming: StoredMeeting[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.meetings)
    ? parsed.meetings
    : [];
  if (!Array.isArray(incoming) || incoming.length === 0) {
    throw new Error("El archivo no contiene minutas para importar.");
  }

  const current = readAll();
  const byId = new Map<string, StoredMeeting>();
  current.forEach((m) => byId.set(m.id, m));

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const m of incoming) {
    if (!m || typeof m !== "object" || !m.id || !m.meeting || !m.analysis) {
      skipped++;
      continue;
    }
    const existing = byId.get(m.id);
    if (!existing) {
      byId.set(m.id, m);
      imported++;
    } else if ((m.savedAt || 0) > (existing.savedAt || 0)) {
      byId.set(m.id, m);
      updated++;
    } else {
      skipped++;
    }
  }

  const merged = Array.from(byId.values());
  writeAll(merged);
  return { imported, updated, skipped, total: merged.length };
}
