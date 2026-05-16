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
    proxy_read_timeout 360s;                       # /api/analyze puede tardar 1-3 min en reuniones largas
    client_max_body_size 5m;                       # el audio NO pasa por acá (va directo a AssemblyAI), pero por las dudas
}
```

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
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Recomendada | Historial compartido entre dispositivos/dominios (ver §4). Sin esto, el historial queda solo en localStorage del browser |
| `MASTER_KEY` | Recomendada | Clave maestra admin: gatea el borrado de minutas y permite abrir cualquier minuta protegida. Sin esto, el borrado no pide clave y las minutas protegidas solo se abren con su clave individual |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | Para distribución | Envío de la minuta por email con PDF FOG-11 adjunto (`/api/distribute`). `SMTP_SECURE=true` solo si puerto 465 |

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
- **Minutas protegidas**: cifrado AES-GCM **client-side**. v2 = DEK
  doble-envuelta (clave de usuario + `MASTER_KEY` vía server). El server
  nunca ve el contenido en claro al proteger.
- **Áreas**: lista cerrada en `lib/areas.ts` (editar ahí para agregar/quitar).
- `maxDuration` exportado en algunas rutas API es un hint de Vercel; en
  self-host no aplica — el límite real lo pone `proxy_read_timeout` de nginx.
- Todo en español, identidad visual KIR (`public/kir-logo.png`).

---

## 7. Repositorio

GitHub: `https://github.com/PabloKir/Kir-meeting-bot` (rama `main`).
Este zip es una copia del código sin `node_modules`, `.next`, `.git`,
`.vercel` ni `.env.local`.
