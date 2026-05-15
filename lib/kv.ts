// =============================================================================
// Cliente Redis (Upstash / Vercel KV) — solo server-side
// =============================================================================
// La integracion de Vercel Storage setea KV_REST_API_URL / KV_REST_API_TOKEN
// (o las UPSTASH_* segun el flujo). Soportamos ambas y degradamos a null si
// no hay credenciales, para que la app siga andando con localStorage solo.
// =============================================================================

import { Redis } from "@upstash/redis";

let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;

  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    "";
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    "";

  if (!url || !token) {
    cached = null;
    return null;
  }

  try {
    cached = new Redis({ url, token });
  } catch (e) {
    console.error("kv: no se pudo inicializar Redis", e);
    cached = null;
  }
  return cached;
}

export const HISTORY_KEY = "kir:history:v1";
