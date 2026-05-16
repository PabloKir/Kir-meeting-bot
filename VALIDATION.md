# Checklist de validación post-deploy (VPS)

Para correr **después** de deployar en el VPS y antes de habilitar a la
organización. Marcá cada ítem. Si alguno falla, ver "Si falla" y/o `DEPLOY.md`.

Reemplazá `https://APP` por la URL real (ej. `https://minuta.kir.com.ar`).

---

## 0. Pre-requisitos

- [ ] Node 18.18+/20 LTS instalado (`node -v`)
- [ ] `.env.local` creado en la raíz con las variables (ver `.env.example`)
- [ ] `npm ci` sin errores
- [ ] `npm run build` termina OK (sin "Failed to compile")
- [ ] App levantada con pm2 (`pm2 start ecosystem.config.js --env production`) y `pm2 status` = online
- [ ] nginx con HTTPS apuntando a `127.0.0.1:3000`, con `X-Forwarded-Proto` y `proxy_read_timeout 360s`

## 1. Salud de servicios (desde una terminal)

- [ ] `curl https://APP/api/master/status` → `{"configured":true}` (si se cargó `MASTER_KEY`)
- [ ] `curl -X POST https://APP/api/master/verify -H "content-type: application/json" -d "{\"key\":\"<CLAVE_MAESTRA>\"}"` → `{"configured":true,"ok":true}`
- [ ] `curl https://APP/api/history` → `{"configured":true,"meetings":[...]}` (si KV configurado). Si devuelve `configured:false`, el historial será solo local por navegador
- [ ] Round-trip master (prueba que cifrar/recuperar funciona):
  - `curl -X POST https://APP/api/master/wrap -H "content-type: application/json" -d "{\"dek\":\"dGVzdA==\"}"` → copiar el `masterWrap`
  - `curl -X POST https://APP/api/master/unwrap -H "content-type: application/json" -d "{\"key\":\"<CLAVE_MAESTRA>\",\"masterWrap\":<EL_OBJETO>}"` → debe devolver `"dek":"dGVzdA=="`

## 2. Golden path (en el browser)

- [ ] **A.01 Setup**: nombre, **Área** (select obligatorio), objetivo → Continuar
- [ ] **A.02 Participantes**: cargar 2+ con email → Iniciar reunión
- [ ] **B.01 Captura**: "Cargar transcripción de ejemplo" (o subir un audio corto real) → Mapear voces
- [ ] **B.02**: asignar voces → Analizar
- [ ] **B.03 Análisis**: Claude devuelve resumen/tareas/riesgos (puede tardar 1-3 min en audios largos; no debe cortar por timeout — si corta, subir `proxy_read_timeout` en nginx)
- [ ] **B.04 / C.01 / C.02**: llegar a la Minuta. Render FOG-11 con logo KIR visible
- [ ] **Exportar PDF**: abre ventana de impresión / guarda PDF correcto
- [ ] La minuta aparece sola en **D.01 Historial**

## 3. Historial compartido (si KV configurado)

- [ ] Abrir la app en **otro navegador o dispositivo** → la minuta del paso 2 aparece en D.01 (prueba que el server compartido anda)
- [ ] **Exportar backup .json** descarga un archivo; **Importar** lo vuelve a tomar

## 4. Protección con clave + clave maestra

- [ ] En una minuta de prueba: **🔒 Proteger** → poner clave (2 veces) → queda 🔒 "CONTENIDO CIFRADO"
- [ ] **Desbloquear** con esa clave individual → muestra el contenido
- [ ] **Abrir con master** con la `MASTER_KEY` → abre la misma minuta sin la clave individual
- [ ] **Eliminar** una minuta → pide la `MASTER_KEY`; con clave incorrecta NO borra; con la correcta borra (local + server)

## 5. Distribución por email (si SMTP configurado)

- [ ] En C.02 Minuta → **Distribuir** → destinatarios pre-cargados con los emails de participantes
- [ ] Enviar → llega el email con el **PDF FOG-11 adjunto** a la casilla de prueba
- [ ] Si SMTP NO está configurado: el botón da error 500 con mensaje claro y **el resto de la app sigue funcionando** (esperado)

## 6. Dashboard (D.02)

- [ ] Muestra KPIs, carga por responsable, mapa de riesgos por área, pendientes por área
- [ ] El **filtro por área** recalcula las métricas
- [ ] Las minutas protegidas quedan excluidas con aviso (su contenido está cifrado)

---

## Si falla

| Síntoma | Causa probable / acción |
|---|---|
| `master/status` → `configured:false` | `MASTER_KEY` no quedó en el entorno. Verificar `.env.local` (sin comillas, sin espacios/`\n` al final) y reiniciar pm2 (`pm2 restart kir-meeting-agent`) |
| `master/verify` → `ok:false` con la clave correcta | El valor guardado tiene un carácter de más (típico: `\r` o espacio). Reescribir la línea en `.env.local` y `pm2 restart` |
| "Abrir con master" → "se protegió con una clave maestra anterior" | Sobre viejo: esa minuta se protegió con otra `MASTER_KEY`. Abrir con su clave individual y re-proteger. Fijar la `MASTER_KEY` definitiva antes de proteger en prod |
| Análisis corta (~30-60s) | `proxy_read_timeout` de nginx muy bajo. Subir a 360s |
| Historial no se comparte entre dispositivos | KV no configurado o credenciales mal. Ver `DEPLOY.md` §4 |
| El logo no aparece en el PDF | nginx no pasa `X-Forwarded-Proto`; o `public/kir-logo.png` no se desplegó |
| Email no sale | Revisar SMTP_* en `.env.local`; `SMTP_SECURE=true` solo si puerto 465 |

Logs de la app: `pm2 logs kir-meeting-agent` (o `./logs/pm2-*.log`).
