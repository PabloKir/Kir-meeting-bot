# Configurar el envío de email (Resend) — guía self-serve para el CTO

La app distribuye la minuta (PDF FOG-11 firmado) por email y manda los
recordatorios automáticos usando **Resend**. Mientras estas variables no
estén, el botón "Distribuir" responde 500 con mensaje claro y el resto de
la app funciona normal. Esta guía la podés hacer vos de punta a punta
(~15 min + propagación DNS).

---

## 1. Crear cuenta y API Key

1. Crear cuenta en https://resend.com (plan free alcanza para arrancar).
2. **API Keys → Create API Key** → permiso *Sending access* → copiar el
   valor (empieza con `re_`). Se muestra una sola vez.

## 2. Verificar el dominio (SPF + DKIM)

1. **Domains → Add Domain**. Recomendado un subdominio dedicado para
   transaccional, ej. `mg.kir.com.ar` (no pisa el mail corporativo). Si
   preferís el raíz, usá `kir.com.ar`.
2. Resend muestra los registros DNS a cargar en el DNS de `kir.com.ar`
   (donde administren la zona). Son del tipo:
   - **TXT** (SPF): `v=spf1 include:...resend... ~all`
   - **CNAME/TXT** (DKIM): 1–3 registros `resend._domainkey...`
   - (opcional pero recomendado) **TXT DMARC**: `_dmarc` →
     `v=DMARC1; p=none; rua=mailto:dmarc@kir.com.ar`
3. Cargar esos registros **exactamente** como los da Resend. Esperar la
   propagación y tocar **Verify** en Resend hasta que quede *Verified*
   (suele ser minutos; a veces hasta 24–48 hs según el DNS).
4. El remitente (`RESEND_FROM`) **debe** usar ese dominio verificado.

## 3. Setear las variables de entorno

| Variable | Valor | Obligatoria |
|---|---|---|
| `RESEND_API_KEY` | la key `re_...` del paso 1 | Sí |
| `RESEND_FROM` | `KIR Minutas <minuta@mg.kir.com.ar>` (usar el dominio verificado) | Sí |
| `SLACK_WEBHOOK_URL` | Incoming Webhook del canal (opcional) | No |
| `CRON_SECRET` | ya está seteada (recordatorios) | — |

**Dónde cargarlas:**

- **Si la app corre en Vercel**: proyecto `kir-meeting-bot` → Settings →
  Environment Variables → entorno **Production** → agregar cada una →
  **Redeploy** (Deployments → último → Redeploy) para que tome los valores.
- **Si la app corre self-host en el VPS**: agregarlas a `.env.local` en la
  raíz del proyecto y reiniciar (`pm2 restart kir-meeting-agent`).

> ⚠️ Sin comillas ni espacios/saltos de línea al final del valor.
> `RESEND_FROM=KIR Minutas <minuta@mg.kir.com.ar>` (así, sin comillas).

## 4. Probar

1. En la app: una reunión → llegar a **C.02 Minuta** → **Distribuir** →
   poner tu email → Enviar.
2. Debe llegar el email con el **PDF FOG-11 adjunto** y, en el PDF, el
   bloque **VALIDACIÓN E INTEGRIDAD** (ID + huella SHA-256 + firmas).
3. Si configuraste Slack y dejaste el check tildado → llega el resumen al
   canal.
4. Recordatorios automáticos (D.03.10): usan la misma config de Resend.
   Disparo manual de prueba:
   ```
   curl -H "Authorization: Bearer <CRON_SECRET>" https://minuta.kir.com.ar/api/cron/follow-up
   ```
   Responde `{ ok:true, responsablesNotificados, ... }`.

## 5. Si falla

| Síntoma | Causa / acción |
|---|---|
| Botón Distribuir → 500 "Email no configurado" | Faltan `RESEND_API_KEY`/`RESEND_FROM`; o no se redeployó tras cargarlas |
| Resend rechaza el envío (error en la respuesta) | `RESEND_FROM` no usa un dominio **Verified** en Resend, o la API key es de otro proyecto/sin permiso de envío |
| El mail cae en spam | Falta DKIM/SPF verificado o DMARC; revisar que el dominio quede *Verified* en Resend |
| Slack no postea | `SLACK_WEBHOOK_URL` ausente o inválida; es best-effort, no corta el email |
| Recordatorios no llegan | `CRON_SECRET` o el cron; ver `VALIDATION.md` §5b |

Logs útiles: en Vercel → Deployments → Functions → `/api/distribute`.
En VPS → `pm2 logs kir-meeting-agent`.
