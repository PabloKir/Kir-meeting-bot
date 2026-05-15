/** @type {import('next').NextConfig} */
// El audio se sube directo del cliente a AssemblyAI (ver Capture.tsx +
// /api/aai-key) para evitar el limite hard de 4.5 MB de Vercel en API
// routes, por eso ya no necesitamos elevar bodySizeLimit.
const nextConfig = {};

module.exports = nextConfig;
