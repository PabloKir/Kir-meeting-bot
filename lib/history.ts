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
import {
  decryptJSON,
  genDEK,
  encryptWithDEK,
  decryptWithDEK,
  wrapDEK,
  unwrapDEK,
  type EncBlob,
  type EncBlobV2,
  type AnyEnc,
} from "./crypto";

let _masterStatus: boolean | null = null;
export async function isMasterConfigured(): Promise<boolean> {
  if (_masterStatus !== null) return _masterStatus;
  try {
    const res = await fetch("/api/master/status", { cache: "no-store" });
    const data = await res.json();
    _masterStatus = !!data?.configured;
  } catch {
    _masterStatus = false;
  }
  return _masterStatus;
}

const STORAGE_KEY = "kir-meeting-agent.history.v1";

// Contenido sensible de una minuta. Cuando la minuta esta protegida, este
// objeto va cifrado en `enc` y los campos meeting/participants/analysis
// quedan undefined en el StoredMeeting (solo se ve metadata minima).
export interface MeetingPayload {
  meeting: Meeting;
  participants: Participant[];
  analysis: Analysis;
  utteranceCount: number;
}

export interface StoredMeeting {
  id: string;
  savedAt: number;
  // Contenido en claro (cuando NO esta protegida)
  meeting?: Meeting;
  participants?: Participant[];
  analysis?: Analysis;
  utteranceCount?: number;
  // Proteccion con clave
  protected?: boolean;
  label?: string; // nombre visible aunque este cifrada
  dateLabel?: string; // fecha visible (YYYY-MM-DD) aunque este cifrada
  areaLabel?: string; // area visible aunque este cifrada (para dashboards)
  enc?: AnyEnc; // MeetingPayload cifrado (v1 password-only o v2 con master)
}

export function isProtected(m: StoredMeeting): boolean {
  return !!m.protected && !!m.enc;
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

// Elimina una minuta. Si hay MASTER_KEY configurada, el server exige la clave
// (se pasa por header). Solo se borra de localStorage si el server acepto.
export async function deleteMeeting(id: string, masterKeyInput?: string): Promise<void> {
  const res = await fetch(`/api/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: masterKeyInput ? { "x-master-key": masterKeyInput } : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `No se pudo eliminar (HTTP ${res.status})`);
  }
  writeAll(readAll().filter((m) => m.id !== id));
}

export function clearAllMeetings(): void {
  writeAll([]);
}

// =============================================================================
// Proteccion con clave
// =============================================================================

// Cifra el contenido de una minuta ya guardada (envelope v2 con DEK).
// La DEK se envuelve con la password del usuario y -si hay MASTER_KEY- tambien
// con la clave maestra (via server), para recuperacion por admin.
export async function protectMeeting(id: string, password: string): Promise<void> {
  if (!password || password.length < 4) {
    throw new Error("La contraseña debe tener al menos 4 caracteres.");
  }
  const all = readAll();
  const idx = all.findIndex((m) => m.id === id);
  if (idx < 0) throw new Error("Minuta no encontrada.");
  const m = all[idx];
  if (isProtected(m)) throw new Error("La minuta ya está protegida.");
  if (!m.meeting || !m.analysis) {
    throw new Error("No hay contenido para proteger.");
  }
  const payload: MeetingPayload = {
    meeting: m.meeting,
    participants: m.participants || [],
    analysis: m.analysis,
    utteranceCount: m.utteranceCount || 0,
  };

  const dek = genDEK();
  const payloadEnc = await encryptWithDEK(payload, dek);
  const userWrap = await wrapDEK(dek, password);

  // masterWrap: pedirle al server que envuelva la DEK con la MASTER_KEY.
  // El server solo ve la DEK (bytes random), nunca el contenido.
  let masterWrap;
  try {
    const res = await fetch("/api/master/wrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dek }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.configured && data.masterWrap) masterWrap = data.masterWrap;
    }
  } catch {
    /* sin master: la minuta queda recuperable solo por password de usuario */
  }

  const enc: EncBlobV2 = { v: 2, payload: payloadEnc, userWrap, masterWrap };
  const locked: StoredMeeting = {
    id: m.id,
    savedAt: Date.now(),
    protected: true,
    label: m.meeting.name || "(sin nombre)",
    dateLabel: m.meeting.date || "",
    areaLabel: m.meeting.area || "",
    enc,
  };
  all[idx] = locked;
  writeAll(all);
  pushMeetingToServer(locked);
}

async function decryptStored(enc: AnyEnc, password: string): Promise<MeetingPayload> {
  if ((enc as EncBlobV2).v === 2) {
    const e = enc as EncBlobV2;
    const dek = await unwrapDEK(e.userWrap, password); // throws si clave mala
    return decryptWithDEK<MeetingPayload>(e.payload, dek);
  }
  return decryptJSON<MeetingPayload>(enc as EncBlob, password);
}

// Descifra con la password de usuario. Lanza si la clave es incorrecta.
export async function unlockPayload(
  m: StoredMeeting,
  password: string
): Promise<MeetingPayload> {
  if (!isProtected(m) || !m.enc) {
    return {
      meeting: m.meeting as Meeting,
      participants: m.participants || [],
      analysis: m.analysis as Analysis,
      utteranceCount: m.utteranceCount || 0,
    };
  }
  return decryptStored(m.enc, password);
}

// Recupera el contenido con la CLAVE MAESTRA (admin). El server desenvuelve la
// DEK; el descifrado del payload sigue siendo client-side.
export async function unlockPayloadWithMaster(
  m: StoredMeeting,
  masterKeyInput: string
): Promise<MeetingPayload> {
  if (!isProtected(m) || !m.enc) {
    return {
      meeting: m.meeting as Meeting,
      participants: m.participants || [],
      analysis: m.analysis as Analysis,
      utteranceCount: m.utteranceCount || 0,
    };
  }
  const e = m.enc as EncBlobV2;
  if (e.v !== 2 || !e.masterWrap) {
    throw new Error(
      "Esta minuta se protegió sin clave maestra (versión anterior). Solo se abre con su contraseña individual."
    );
  }
  const res = await fetch("/api/master/unwrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: masterKeyInput, masterWrap: e.masterWrap }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.dek) {
    throw new Error(data.error || "No se pudo recuperar con la clave maestra.");
  }
  return decryptWithDEK<MeetingPayload>(e.payload, data.dek);
}

// Quita la proteccion: verifica la clave (de usuario) y reescribe en claro.
export async function removeProtection(id: string, password: string): Promise<void> {
  const all = readAll();
  const idx = all.findIndex((m) => m.id === id);
  if (idx < 0) throw new Error("Minuta no encontrada.");
  const m = all[idx];
  if (!isProtected(m) || !m.enc) throw new Error("La minuta no está protegida.");
  const payload = await decryptStored(m.enc, password); // throws si clave mala
  const open: StoredMeeting = {
    id: m.id,
    savedAt: Date.now(),
    meeting: payload.meeting,
    participants: payload.participants,
    analysis: payload.analysis,
    utteranceCount: payload.utteranceCount,
  };
  all[idx] = open;
  writeAll(all);
  pushMeetingToServer(open);
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
  const fingerprint = (m?: Meeting) =>
    m ? `${m.name}|${m.date}|${m.time}` : "";
  const fp = fingerprint(data.meeting);
  // No matchear contra minutas protegidas (no exponen meeting) ni con fp vacio.
  const idx = fp
    ? all.findIndex((m) => !isProtected(m) && fingerprint(m.meeting) === fp)
    : -1;
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
    const validOpen = m && typeof m === "object" && m.id && m.meeting && m.analysis;
    const validProtected = m && typeof m === "object" && m.id && m.protected && m.enc;
    if (!validOpen && !validProtected) {
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
