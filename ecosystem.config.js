// =============================================================================
// pm2 — KIR Meeting Agent (deploy self-host en VPS)
// =============================================================================
// Uso:
//   npm ci
//   npm run build
//   pm2 start ecosystem.config.js --env production
//   pm2 save && pm2 startup     # arranque automático al bootear el VPS
//
// Las credenciales (ANTHROPIC_API_KEY, ASSEMBLYAI_API_KEY, MASTER_KEY,
// KV_*, SMTP_*) van en .env.local en la raíz del proyecto. Next.js carga
// .env.local automáticamente en runtime: NO hace falta repetirlas acá.
// Solo dejamos en este archivo lo no sensible (puerto, NODE_ENV).
//
// Detrás de nginx como reverse proxy con HTTPS. Recordá en nginx:
//   proxy_set_header X-Forwarded-Proto $scheme;
//   proxy_read_timeout 360s;   # /api/analyze puede tardar 1-3 min
// =============================================================================

module.exports = {
  apps: [
    {
      name: "kir-meeting-agent",
      // next start (single-process). No usar cluster: Next standalone no
      // está configurado y el estado real vive en Redis/localStorage.
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      // Logs (ajustar ruta según el VPS)
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
