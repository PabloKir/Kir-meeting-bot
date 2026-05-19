# KIR Meeting Agent — HANDOFF (índice para el CTO)

Punto de entrada único del traspaso. Producto interno de KIR S.A.:
graba reuniones → transcribe + diariza (AssemblyAI) → analiza con Claude →
minuta FOG-11 firmada, distribución por email/Slack, historial,
dashboards por área y recordatorios automáticos.

- **Repo:** https://github.com/PabloKir/Kir-meeting-bot
- **App:** https://minuta.kir.com.ar (detrás de SSO M365 del proxy de KIR)
- **Stack:** Next.js 14 (App Router) + TS + Tailwind + Zustand · Vercel KV
  (Upstash Redis) · AssemblyAI · Anthropic Claude · Resend.

## Documentos (leer en este orden)

| Doc | Para qué |
|---|---|
| `HANDOFF.md` (este) | Estado, pendientes, fix de infra crítico |
| `EMAIL-SETUP.md` | **Self-serve: activar email (Resend) + Slack** |
| `DEPLOY.md` | Deploy self-host en VPS (build, env, nginx/pm2, Redis) |
| `VALIDATION.md` | Checklist de validación post-deploy paso a paso |
| `.env.example` | Todas las variables documentadas |
| `README.md` | Funcional del producto / flujo de pantallas |

## Estado actual

Todo el código está completo, deployado y verificado end-to-end:

- ✅ Transcripción + diarización (upload directo a AssemblyAI; polling
  tolerante a cortes de red — funciona en reuniones largas).
- ✅ Análisis con Claude **asíncrono** (job + polling vía KV; no lo cortan
  los timeouts de proxy/Cloudflare). Selector de modelo
  **Haiku/Sonnet/Opus** (Haiku recomendado para reuniones largas).
- ✅ Minuta FOG-11 + **PDF firmado** (sello de integridad SHA-256 + bloque
  de firmas).
- ✅ Distribución **email (Resend) + Slack** (D.03.04).
- ✅ Selector de **fecha por tarea** en C.01.
- ✅ **Follow-up automático** (D.03.10): cron diario de recordatorios +
  botón "Próxima minuta" (arrastra compromisos abiertos).
- ✅ Historial compartido (KV) + backup JSON · Dashboard por área (mapa de
  riesgos, pendientes por área) · Minutas protegidas con clave + clave
  maestra admin.

## ⚠️ BLOQUEANTE de infra (acción del CTO)

`minuta.kir.com.ar` resuelve al **oauth2-proxy / openresty** de KIR, cuyo
*upstream* está sirviendo un **build viejo** → los usuarios ven errores ya
resueltos. Del lado de Vercel está todo correcto y verificado.

**Datos:**
- Deployment de producción actual (verificado OK): la app la sirve el
  alias estable **`https://kir-meeting-bot.vercel.app`** (se actualiza
  solo en cada deploy).

**Fix (en la config del oauth2-proxy/openresty que administra el CTO):**

1. `upstream` → **`https://kir-meeting-bot.vercel.app`** (el alias estable,
   NO una URL `kir-meeting-xxxx.vercel.app` puntual, que queda vieja).
   Mandar `Host: kir-meeting-bot.vercel.app` + SNI correspondiente.
2. **Vercel Deployment Protection** está activa y devuelve 401 al proxy.
   Como la app ya está protegida por el SSO M365 del proxy, lo más limpio
   es **desactivarla** (Vercel → proyecto kir-meeting-bot → Settings →
   Deployment Protection → Disabled).
   - Si se quiere mantener: activar **Protection Bypass for Automation** y
     que openresty inyecte en cada request al upstream los headers
     `x-vercel-protection-bypass: <token>` y `x-vercel-set-bypass-cookie: true`.
3. **Desactivar/purgar cualquier `proxy_cache`** de openresty para la app
   (un HTML cacheado referencia bundles JS viejos = build viejo aunque el
   origin esté al día).

**Verificación post-fix:**
```
curl -s https://kir-meeting-bot.vercel.app/api/master/status   # => {"configured":true}
```
En la app, B.03 debe mostrar el título "Agente · Análisis de la reunión" +
chips de modelo Haiku/Sonnet/Opus.

> Alternativa: si se prefiere **no** proxyear a Vercel y self-hostear en el
> VPS, seguir `DEPLOY.md` (mismo código, sin esta dependencia de routing).

## Pendientes para dejarlo 100% operativo

1. **Email/Slack** → seguir `EMAIL-SETUP.md` (cuenta Resend + dominio
   verificado + env vars). `CRON_SECRET` ya está seteada.
2. **Destrabar el upstream del proxy** (sección anterior).
3. (Opcional) Rotar `MASTER_KEY` / API keys si circularon en traspasos.

## Variables de entorno (resumen)

Obligatorias: `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`,
`KV_REST_API_URL` + `KV_REST_API_TOKEN` (KV / async).
Email: `RESEND_API_KEY`, `RESEND_FROM` (ver EMAIL-SETUP.md).
Admin/automation: `MASTER_KEY`, `CRON_SECRET`. Opcional:
`SLACK_WEBHOOK_URL`, `CLAUDE_MODEL_*`. Detalle completo en `.env.example`.
