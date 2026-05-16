// =============================================================================
// Áreas de la organización — lista cerrada (no texto libre)
// =============================================================================
// Tener un vocabulario controlado permite seguimiento cross-organización:
// dashboards por área, mapas de riesgo y tareas pendientes agrupadas.
// Si se agrega/renombra un área, las minutas viejas conservan el string
// guardado; el dashboard las muestra igual (se agrupan por el texto tal cual).
// =============================================================================

export const AREAS = [
  "Gerencia",
  "Finanzas",
  "Producción",
  "Obra / Dirección de Obra - Cliente",
  "Compras",
  "RRHH",
  "Calidad",
  "Seguridad e Higiene",
  "Comercial / Cliente",
  "Administración",
  "Legales",
  "Sistemas",
  "Dirección",
] as const;

export type Area = (typeof AREAS)[number];

export const DEFAULT_AREA: Area = "Gerencia";
