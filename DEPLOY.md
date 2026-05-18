# KIR Meeting Agent — Guía de deploy (handoff a CTO)

App **Next.js 14 (App Router)** que transcribe reuniones (AssemblyAI), las
analiza con Claude y genera minutas FOG-11. Hoy corre en Vercel
(`minuta.kir.com.ar`); esta guía es para self-host en el VPS de KIR.

---

## 1. Stack y requisitos del VPS

- **Node.js 18.18+ o 20 LTS** (recomendado 20) + npm.
- Proceso administrado con **pm2** o **systemd**.
- **Reverse proxy** (nginx) con HTTPS (Let's Encrypt).
- Salida a internet hacia: `api.assemblyai.com`, `api.anthropic.com`, y el
  Redis/KV (ver §4).
- Sin GPU ni dependencias nativas: el PDF se genera con `@react-pdf/renderer`
  (JS puro), no usa Chromium.

---

## 2. Build & run

```bash
npm ci                 # instala dependencias (usa package-lock.json)
npm run build          # build de producción Next.js
npm run start          # arranca en http://localhost:3000
```

Detrás de nginx (ejemplo de location):

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;   # IMPORTANTE: el PDF arma la URL del logo con esto
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;                       # holgura; el análisis ya NO es síncrono (ver §6 — job + polling)
    client_max_body_size 8m;                       # el audio NO pasa por acá (va directo a AssemblyAI); esto cubre el JSON del transcript
}
```

> ✅ **El análisis de Claude es asíncrono** (job + polling, ver §6). Ninguna
> request individual dura más de unos segundos, así que **los timeouts de
> reverse-proxy / Cloudflare / oauth2-proxy ya NO son un problema**. Igual
> conviene dejar `proxy_read_timeout` ≥ 60s por las demás rutas.

> ⚠️ Si la app queda detrás de un **oauth2-proxy / Cloudflare** (SSO
> corporativo): apuntá el *upstream* al **origen estable** (el server
> Next.js / alias de producción), NO a una URL de deployment efímera, para
> que los redeploys lleguen sin reconfigurar el proxy. El audio se sube
> directo del browser a AssemblyAI: si el proxy filtra dominios de salida,
> permití `api.assemblyai.com` y `api.anthropic.com`.

pm2 (hay un `ecosystem.config.js` listo en la raíz):

```bash
mkdir -p logs
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup     # arranque automático al bootear el VPS
```

---

## 3. Variables de entorno (obligatorio)

Crear `.env.local` en la raíz (NO se commitea — está en `.gitignore`). Ver
`.env.example` como base.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Sí** | Análisis con Claude (`/api/analyze`) |
| `ASSEMBLYAI_API_KEY` | **Sí** | Transcripción + diarización. Se expone al browser vía `/api/aai-key` (la app es interna; si se quiere ocultar, sumar auth) |
| `CLAUDE_MODEL` | No | Modelo de Claude. Default `claude-sonnet-4-6`. `claude-haiku-4-5` = más rápido/barato |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | **Sí** (detrás de proxy) | Historial compartido (ver §4) **y backend del análisis asíncrono** (ver §6). Sin KV, `/api/analyze` cae a modo síncrono — sirve solo en local; detrás de Cloudflare/oauth2-proxy con timeout corto daría 502 en reuniones largas |
| `MASTER_KEY` | Recomendada | Clave maestra admin: gatea el borrado de minutas y permite abrir cualquier minuta protegida. Sin esto, el borrado no pide clave y las minutas protegidas solo se abren con su clave individual |
| `RESEND_API_KEY` + `RESEND_FROM` | Para distribución | Envío de la minuta (PDF FOG-11 firmado) por email vía **Resend** (`/api/distribute`). `RESEND_FROM` debe usar un dominio verificado en Resend (SPF+DKIM por DNS). Reemplaza al viejo SMTP/nodemailer |
| `SLACK_WEBHOOK_URL` | Opcional | Incoming Webhook: al distribuir, postea un resumen al canal. Sin esto, se omite Slack |
| `CRON_SECRET` | Para follow-up | Protege `/api/cron/follow-up` (recordatorios automáticos D.03.10). En Vercel + `vercel.json` el cron diario lo usa solo; en VPS, el cron del sistema debe mandar `Authorization: Bearer <CRON_SECRET>` |

> ⚠️ **Cuidado con el valor exacto de las claves**: no dejar saltos de línea
> ni espacios al final (ej. `MASTER_KEY`). En `.env.local` simplemente
> `MASTER_KEY=LaClaveExacta` sin comillas.

> 🔁 **Rotar `MASTER_KEY` invalida la recuperación master de las minutas ya
> protegidas** (su "sobre maestro" quedó cifrado con la clave anterior). Es
> el comportamiento correcto de cualquier esquema con clave maestra rotable.
> Esas minutas siguen abriéndose con su contraseña individual; para que
> vuelvan a ser recuperables por master: abrirlas con su clave, "Quitar
> clave" y "Proteger" de nuevo. Por eso conviene **fijar la `MASTER_KEY`
> definitiva ANTES** de empezar a proteger minutas en productivo.

> 🔐 Rotar `MASTER_KEY` y regenerar las API keys antes de productivo si los
> valores actuales circularon en chats/handoffs.

---

## 4. Redis / KV (historial compartido)

El historial usa un cliente Redis compatible con Upstash
(`@upstash/redis`). Dos opciones en el VPS:

- **Reutilizar el Upstash actual**: copiar `KV_REST_API_URL` y
  `KV_REST_API_TOKEN` del proyecto Vercel (Settings → Storage). Funciona
  igual desde el VPS.
- **Redis propio**: levantar un Redis con la **REST API de Upstash**
  (`upstash/redis` self-host vía Serverless Redis HTTP / SRH) o usar el
  servicio Upstash. El código lee `KV_REST_API_URL`/`KV_REST_API_TOKEN` o
  `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. No usa el protocolo
  Redis nativo (TCP 6379), usa REST.

Si no se configura, la app **no rompe**: el historial cae a localStorage
por navegador y el dashboard solo ve lo local.

---

## 5. Endpoints de salud / verificación post-deploy

- `GET /api/master/status` → `{ "configured": true|false }` (si tomó `MASTER_KEY`)
- `POST /api/master/verify` `{ "key": "..." }` → `{ "ok": true }` con la clave correcta
- `GET /api/history` → `{ "configured": true, "meetings": [...] }` (si KV ok)

Probar el flujo end-to-end: Setup → Captura (subir un audio corto) →
Análisis → Minuta → Exportar PDF → Distribuir (si SMTP).

➡️ **Seguir el checklist paso a paso en `VALIDATION.md`** (incluye comandos
curl de healthcheck, golden path, prueba de clave maestra y tabla de
"si falla → qué hacer"). Correrlo completo antes de habilitar a la
organización.

---

## 6. Arquitectura — puntos clave

- `app/` rutas + API; `components/` stages + Brand; `lib/` store Zustand,
  crypto, history, areas, pdf.
- **Audio**: el browser sube el archivo **directo a AssemblyAI** (evita el
  límite de body de serverless). En VPS también conviene mantenerlo así.
- **Análisis Claude = asíncrono (job + polling)**: `POST /api/analyze`
  registra un job en KV y devuelve `{ jobId }` al instante; Claude corre en
  background (`waitUntil` de `@vercel/functions`, hasta `maxDuration`) y
  guarda el resultado en KV (TTL 1h); el cliente hace polling a
  `GET /api/analyze/[id]` cada 3s. Motivo: detrás de Cloudflare/oauth2-proxy
  los timeouts cortos (30-100s) cortaban la llamada síncrona (Claude tarda
  1-3 min) → 502. Con jobs, ninguna request es larga. **Requiere KV.** Sin
  KV cae a modo síncrono (solo apto para local). La transcripción vive en
  localStorage, así que un fallo de análisis nunca la pierde.
- **Minutas protegidas**: cifrado AES-GCM **client-side**. v2 = DEK
  doble-envuelta (clave de usuario + `MASTER_KEY` vía server). El server
  nunca ve el contenido en claro al proteger.
- **Áreas**: lista cerrada en `lib/areas.ts` (editar ahí para agregar/quitar).
- `maxDuration` exportado en rutas API es un hint de Vercel (tope del
  trabajo en background del análisis). En self-host con `next start` no hay
  ese tope; el job corre en el proceso Node hasta terminar. `waitUntil` de
  `@vercel/functions` es un no-op seguro fuera de Vercel (la promesa igual
  se ejecuta), así que el patrón job+polling funciona igual en el VPS.
- **Distribución (D.03.04)**: `/api/distribute` genera el PDF FOG-11 con
  **sello de integridad** (SHA-256 del contenido canónico + ID + bloque de
  firmas) y lo manda por **Resend** (email) y opcionalmente postea un
  resumen a **Slack** (webhook). No es firma X.509: es huella verificable.
- **Follow-up (D.03.10)**: tareas con `dueDate` (selector en C.01 Cierre).
  `GET /api/cron/follow-up` (protegido por `CRON_SECRET`) corre a diario
  (Vercel Cron vía `vercel.json`; en VPS, cron del sistema) y manda un
  digest por Resend a cada responsable con sus tareas vencidas / por vencer
  en 48h. Dedupe diario en KV. Botón "Próxima minuta »" arrastra los
  compromisos abiertos a una nueva minuta de seguimiento.
- **Cron en VPS** (no-Vercel): agregar al crontab, ej. diario 09:00:
  `0 9 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://APP/api/cron/follow-up`
- Todo en español, identidad visual KIR (`public/kir-logo.png`).

---

## 7. Repositorio

GitHub: `https://github.com/PabloKir/Kir-meeting-bot` (rama `main`).
Este zip es una copia del código sin `node_modules`, `.next`, `.git`,
`.vercel` ni `.env.local`.
