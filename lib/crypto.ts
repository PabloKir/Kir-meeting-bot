// =============================================================================
// Cifrado client-side de minutas protegidas
// =============================================================================
// AES-GCM 256 con clave derivada por PBKDF2 (SHA-256, 150k iteraciones) a
// partir de la contraseña que elige el usuario. Todo corre en el browser con
// Web Crypto (crypto.subtle): el servidor / KV / localStorage solo ven texto
// cifrado, nunca el contenido ni la contraseña.
//
// Requiere secure context (https o localhost) — Vercel siempre es https.
// =============================================================================

export interface EncBlob {
  v: 1;
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64
}

const PBKDF2_ITERATIONS = 150_000;

// Devuelve un ArrayBuffer "real" (no SharedArrayBuffer) — necesario para que
// TypeScript acepte el valor como BufferSource en las APIs de Web Crypto.
function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u.byteLength);
  new Uint8Array(out).set(u);
  return out;
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function getSubtle(): SubtleCrypto {
  const c = typeof window !== "undefined" ? window.crypto : undefined;
  if (!c || !c.subtle) {
    throw new Error(
      "Tu navegador no soporta cifrado seguro (Web Crypto) o la página no está en HTTPS."
    );
  }
  return c.subtle;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(password)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJSON(obj: unknown, password: string): Promise<EncBlob> {
  const subtle = getSubtle();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(data)
  );
  return {
    v: 1,
    salt: bufToB64(toArrayBuffer(salt)),
    iv: bufToB64(toArrayBuffer(iv)),
    ct: bufToB64(ct),
  };
}

export async function decryptJSON<T = unknown>(
  blob: EncBlob,
  password: string
): Promise<T> {
  const subtle = getSubtle();
  const salt = b64ToBytes(blob.salt);
  const iv = b64ToBytes(blob.iv);
  const key = await deriveKey(password, salt);
  let pt: ArrayBuffer;
  try {
    pt = await subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(b64ToBytes(blob.ct))
    );
  } catch {
    // AES-GCM falla la verificación de integridad si la clave es incorrecta
    throw new Error("Contraseña incorrecta.");
  }
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
