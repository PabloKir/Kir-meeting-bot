# Onboarding — KIR Meeting Agent (para el CTO en Claude Code)

Si abrís esto en Claude Code, tenés el contexto completo del proyecto para
continuarlo o deployarlo.

## Qué es

App interna de KIR S.A.: graba reuniones → transcribe + diariza
(AssemblyAI) → analiza con Claude → genera minuta **FOG-11** firmada, la
distribuye por email (Resend) y Slack, guarda historial compartido,
dashboards por área y manda recordatorios automáticos de tareas.

Stack: Next.js 14 (App Router) + TypeScript + Tailwind + Zustand. Backend
en API routes. KV = Upstash Redis. Deploy: Vercel (o self-host en VPS).

## Primeros pasos

1. Repo: `https://github.com/PabloKir/Kir-meeting-bot` (rama `main`).
2. Leé en orden: **`HANDOFF.md`** (estado + bloqueante de infra),
   **`EMAIL-SETUP.md`** (activar email Resend, self-serve),
   **`DEPLOY.md`** (self-host VPS), **`VALIDATION.md`** (checklist).
3. `npm ci && npm run build` para compilar. Variables en `.env.example`
   (copiar a `.env.local`).

## Lo más importante ahora

- **Bloqueante:** `minuta.kir.com.ar` (oauth2-proxy/openresty que
  administra IT de KIR) sirve un build viejo. El código y los deploys de
  Vercel están OK. Fix: apuntar el `upstream` del proxy al alias estable
  `https://kir-meeting-bot.vercel.app` + desactivar Vercel Deployment
  Protection (la app ya está detrás del SSO M365) + no cachear el HTML.
  Detalle exacto en `HANDOFF.md` → "BLOQUEANTE de infra".
- **Email:** falta cuenta Resend + dominio verificado + env vars
  (`RESEND_API_KEY`, `RESEND_FROM`). Paso a paso en `EMAIL-SETUP.md`.

## Arquitectura — claves

- Audio: el browser sube **directo a AssemblyAI** (no pasa por el server).
- Análisis Claude: **asíncrono** (POST devuelve jobId → KV → polling), con
  selector de modelo Haiku/Sonnet/Opus. No lo cortan timeouts de proxy.
- Minutas protegidas: cifrado client-side; `MASTER_KEY` (server) abre
  cualquiera y gatea el borrado.
- Áreas: lista cerrada en `lib/areas.ts`. Historial: KV + cache local.
- Todo en español, identidad visual KIR (`public/kir-logo.png`).
- Commits: mensaje vía `.commit-msg.tmp` (PowerShell rompe here-strings).
- En Windows, setear env vars de Vercel por archivo sin newline + stdin
  (el pipe de PowerShell mete `\r`).
