# KIR Meeting Agent

> Asistente de reuniones para **KIR S.A.** — Transcripción automática con diarización (identificación de hablantes) y análisis estructurado por IA. Genera minutas en formato FOG-11 Rev.2 exportables a PDF.

```
»» Pasión por crear
```

---

## ¿Qué hace?

1. **Captura** el audio de la reunión desde el navegador (mic local o sistema)
2. **Transcribe + diariza** automáticamente con AssemblyAI — devuelve "Speaker A dijo X", "Speaker B dijo Y"…
3. **Mapeás** las voces detectadas (A, B, C) a participantes reales con dos clicks (mostrando muestras de lo que dijo cada uno)
4. **Analiza** la transcripción atribuida con Claude Sonnet 4 → resumen ejecutivo, decisiones, tareas con responsable inferido del contexto, riesgos
5. **Pregunta** al usuario para resolver ambigüedades (responsable o plazo sin definir, riesgos a escalar) vía multiple-choice
6. **Genera la minuta** en formato KIR FOG-11 Rev.2 lista para distribuir — copy, exportar a PDF (con logo oficial) o .txt

---

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** con tokens de marca KIR
- **Zustand** (estado global, sin Redux boilerplate)
- **AssemblyAI** — STT + speaker diarization en español
- **Anthropic Claude API** (Sonnet 4.6) — análisis estructurado
- **Vercel** — deploy

---

## Setup local

```bash
# 1. Instalar deps
npm install

# 2. Copiar variables de entorno
cp .env.example .env.local

# 3. Editar .env.local con tus claves
# ASSEMBLYAI_API_KEY=…   https://www.assemblyai.com/dashboard/signup
# ANTHROPIC_API_KEY=…    https://console.anthropic.com/

# 4. Arrancar
npm run dev
# → http://localhost:3000
```

---

## Deploy en Vercel

### Opción 1 · Web (más fácil)

1. Crear repo en GitHub con todo este proyecto
2. Ir a **vercel.com/new** → importar el repo
3. En **Environment Variables** agregar:
   - `ASSEMBLYAI_API_KEY` = tu clave de AssemblyAI
   - `ANTHROPIC_API_KEY` = tu clave de Anthropic
   - `CLAUDE_MODEL` = `claude-sonnet-4-6` (opcional, ese es el default)
4. Deploy → listo

### Opción 2 · CLI

```bash
npm i -g vercel
vercel
# seguir el wizard
vercel env add ASSEMBLYAI_API_KEY production
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

---

## Conseguir API keys

### AssemblyAI (transcripción + diarización)
1. Cuenta gratis en **https://www.assemblyai.com/dashboard/signup**
2. Plan free incluye crédito inicial (~5h de audio)
3. Dashboard → **API Keys** → copiar
4. Tiers pagos arrancan en ~$0.37/h con diarización

### Anthropic (Claude)
1. Cuenta en **https://console.anthropic.com/**
2. **Settings → API Keys → Create Key**
3. Cargar crédito (mínimo USD 5)
4. Sonnet 4.6 vale $3/MTok input, $15/MTok output — una minuta típica cuesta centavos. Si querés más rápido y aún más barato, usá `CLAUDE_MODEL=claude-haiku-4-5`.

---

## Flujo de pantallas

```
A.01  Setup           Nombre, fecha, objetivo, tipo de reunión
A.02  Participantes   Lista con rol, asistencia, capacidad de ser responsable
B.01  Captura         Mic → audio → upload AssemblyAI → polling diarización
B.02  Mapear voces    Speaker A,B,C → Pablo, Diego, Ximena (con muestras)
B.03  Análisis IA     Claude estructura todo en JSON
B.04  Preguntas       Multiple choice para ambigüedades
C.01  Cierre          Validar tareas (sin resp/plazo bloquean)
C.02  Minuta          Documento FOG-11 Rev.2 editable, copy / exportar PDF
D.01  Mejoras         Roadmap de evolución
```

---

## Estructura del código

```
kir-meeting-agent/
├── app/
│   ├── layout.tsx           # Layout root + Google Fonts
│   ├── page.tsx             # Router de stages
│   ├── globals.css          # Brand CSS vars + base
│   └── api/
│       ├── transcribe/
│       │   ├── route.ts          # POST → AssemblyAI
│       │   └── [id]/route.ts     # GET polling estado
│       └── analyze/
│           └── route.ts          # POST → Claude
├── components/
│   ├── Brand.tsx            # Logo, chevrons, eyebrow, cards, buttons
│   ├── Header.tsx           # Top bar
│   ├── Sidebar.tsx          # Navegación A.01 → D.01
│   ├── Setup.tsx            # Stage A.01
│   ├── Participants.tsx     # Stage A.02
│   ├── Capture.tsx          # Stage B.01 (MediaRecorder + AAI)
│   ├── Speakers.tsx         # Stage B.02 (mapeo voces ↔ personas)
│   ├── Analysis.tsx         # Stage B.03 (Claude)
│   └── Stages.tsx           # B.04 + C.01 + C.02 + D.01
├── lib/
│   ├── types.ts             # Tipos compartidos
│   └── store.ts             # Zustand store + sample data
├── package.json
├── tailwind.config.ts       # Tokens KIR
├── next.config.js           # 50mb body limit (audio)
├── tsconfig.json
└── .env.example
```

---

## Probar sin gastar créditos

Las dos pantallas que llaman a APIs externas (Captura y Análisis) tienen botones de **datos de ejemplo**:

- **A.01 → "Cargar datos de ejemplo"** — pre-llena reunión, participantes y transcripción
- **B.01 → "Cargar transcripción de ejemplo"** — salta la grabación con utterances diarizadas pre-cargadas

El **análisis con Claude sí requiere ANTHROPIC_API_KEY** porque es el corazón del valor — pero la transcripción la podés simular.

---

## Identidad de marca

El proyecto respeta el **Manual de Identidad Corporativa KIR**:

- **Colores** — Negro `#222`, gris `#98989A`, teal `#006B68` (acento), blanco. Sin gradientes.
- **Tipografía** — Archivo (display, eyebrows, números) + Roboto (cuerpo) + JetBrains Mono (data, IDs)
- **Lenguaje visual** — Chevrons `»` y `»»` en color teal, corner brackets en cards (sin border-radius), numeración A.01/B.02/C.01, líneas técnicas. Estética industrial sobria.
- **Tono institucional** — Sin marketing, sin emojis, español argentino formal.

---

## Privacidad y compliance

- **El audio no se guarda en el servidor de la app** — se reenvía streaming a AssemblyAI y se descarta. Las claves de API quedan en el backend, nunca expuestas al cliente.
- **AssemblyAI** procesa en US-East. Si KIR necesita procesamiento local, evaluar **Whisper self-hosted + pyannote** sobre Vercel-incompatible (server con GPU).
- **Logs de Claude** se rigen por la política de retención de Anthropic. Solicitar Zero Data Retention si aplica.
- Antes de cada reunión, **informá a los participantes** que se está grabando (botón de aviso de consentimiento en Stage A.02).

---

## Próximos pasos sugeridos

La stage **D.01 Mejoras** lista 10 áreas de evolución concretas: streaming en tiempo real, bots para Meet/Teams/Zoom, sync a Asana/Jira, persistencia en Vercel Postgres, voiceprints, dashboard histórico, follow-up automático, integración con calendario corporativo, PDF firmado, consentimiento digital ISO.

---

## Soporte / contacto

Proyecto interno KIR S.A.
ISO 9001 · Pasión por crear.
