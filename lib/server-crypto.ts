// =============================================================================
// Cripto server-side para la clave maestra (node:crypto)
// =============================================================================
// La MASTER_KEY vive solo como env var en el server (Vercel). El server:
//  - verifica la clave maestra que ingresa un admin (timing-safe)
//  - "envuelve" la DEK aleatoria de una minuta protegida (no ve el contenido)
//  - "desenvuelve" la DEK para recuperacion master (accion de admin)
// Formato WrappedKey { salt, iv, ct } compatible con lib/crypto del cliente.
// El masterWrap solo lo maneja el server (el cliente nunca lo desenvuelve).
// =============================================================================

import crypto from "node:crypto";

const PBKDF2_ITERATIONS = 150_000;

export function masterKey(): string | null {
  const k = process.env.MASTER_KEY;
  return k && k.length > 0 ? k : null;
}

export function verifyMasterKey(input: string): boolean {
  const mk = masterKey();
  if (!mk) return false;
  // Hash a longitud fija para poder usar timingSafeEqual con largos distintos.
  const a = crypto.createHash("sha256").update(input || "").digest();
  const b = crypto.createHash("sha256").update(mk).digest();
  return crypto.timingSafeEqual(a, b);
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
}

export interface WrappedKey {
  salt: string;
  iv: string;
  ct: string;
}

// Envuelve un string (la DEK en base64) con la MASTER_KEY.
export function wrapWithMaster(plain: string): WrappedKey {
  const mk = masterKey();
  if (!mk) throw new Error("MASTER_KEY no configurada en el servidor");
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(mk, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: Buffer.concat([enc, tag]).toString("base64"),
  };
}

// Desenvuelve un WrappedKey producido por wrapWithMaster.
export function unwrapWithMaster(w: WrappedKey): string {
  const mk = masterKey();
  if (!mk) throw new Error("MASTER_KEY no configurada en el servidor");
  const salt = Buffer.from(w.salt, "base64");
  const iv = Buffer.from(w.iv, "base64");
  const key = deriveKey(mk, salt);
  const buf = Buffer.from(w.ct, "base64");
  const tag = buf.subarray(buf.length - 16);
  const enc = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
