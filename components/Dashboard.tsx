"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionHead, BracketedCard, CardHead, Button, Chev, Tag, Alert } from "./Brand";
import { Actions } from "./Setup";
import { listMeetings, syncFromServer, isProtected, type StoredMeeting } from "@/lib/history";
import { useStore } from "@/lib/store";

// =============================================================================
// Stage D.02 · Dashboard histórico + tendencias
// =============================================================================
// Lee TODO el historial (server compartido + cache local) y calcula:
//  - KPIs generales
//  - Tareas por responsable (pendiente vs cerrado)
//  - Tendencia de riesgos por área
//  - Tareas recurrentes no cumplidas
//  - Tendencia mensual de reuniones / tareas
//  - Productividad de seguimiento (gaps de responsable / plazo / confirmación)
// Sin librerías de charts — barras en CSS, estética industrial KIR.
// =============================================================================

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isClosed = (status: string) => /complet/i.test(status || "");
const isPending = (status: string) => !isClosed(status);

export function DashboardStage({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  const markDone = useStore((s) => s.markDone);
  const [meetings, setMeetings] = useState<StoredMeeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [areaFilter, setAreaFilter] = useState<string>("");

  useEffect(() => {
    setMeetings(listMeetings());
    setLoaded(true);
    markDone("dashboard");
    setSyncing(true);
    syncFromServer()
      .then((m) => setMeetings(m))
      .finally(() => setSyncing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const protectedCount = useMemo(
    () => meetings.filter((m) => isProtected(m)).length,
    [meetings]
  );
  const visible = useMemo(
    () => meetings.filter((m) => !isProtected(m)),
    [meetings]
  );
  const areasPresent = useMemo(() => {
    const set = new Set<string>();
    visible.forEach((m) => {
      const a = (m.meeting?.area || "").trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, [visible]);
  const filtered = useMemo(
    () =>
      areaFilter
        ? visible.filter((m) => (m.meeting?.area || "").trim() === areaFilter)
        : visible,
    [visible, areaFilter]
  );
  const d = useMemo(() => computeDashboard(filtered), [filtered]);

  return (
    <>
      <SectionHead
        eyebrow="Stage D.02 · Inteligencia de seguimiento"
        title="Dashboard histórico"
        subtitle="Tendencias sobre todas las minutas registradas: carga por responsable, riesgos por área, tareas recurrentes sin cerrar y productividad de seguimiento. Se nutre del historial compartido."
        meta={{ num: "D.02", label: syncing ? "Sincronizando…" : `${meetings.length} reuniones` }}
      />

      {loaded && meetings.length === 0 && (
        <Alert title="Sin datos todavía">
          El dashboard se construye con las minutas guardadas. Completá al menos una reunión (llegá al stage <b>C.02 Minuta</b>) y volvé acá.
        </Alert>
      )}

      {protectedCount > 0 && (
        <Alert title="Minutas protegidas excluidas">
          {protectedCount} {protectedCount === 1 ? "minuta protegida con clave no se incluye" : "minutas protegidas con clave no se incluyen"} en estas métricas: su contenido está cifrado. El dashboard agrega solo las minutas en claro.
        </Alert>
      )}

      {visible.length > 0 && areasPresent.length > 0 && (
        <div className="bg-white border border-kir-negro p-4 mb-4">
          <div className="font-display uppercase text-kir-gris mb-2 flex items-center gap-1.5" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
            <Chev kind="single" /> Filtrar por área
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAreaFilter("")}
              className={`kir-chip ${areaFilter === "" ? "active" : ""}`}
            >
              <span className="chev">»</span>Todas
            </button>
            {areasPresent.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAreaFilter(a)}
                className={`kir-chip ${areaFilter === a ? "active" : ""}`}
              >
                <span className="chev">»</span>
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 border border-kir-negro mb-6">
            <Kpi label={areaFilter ? `Reuniones · ${areaFilter}` : "Reuniones"} value={d.totalMeetings} />
            <Kpi label="Tareas totales" value={d.totalTasks} sub={`${d.pendingTasks} pendientes`} />
            <Kpi label="Riesgos activos" value={d.totalRisks} sub={`${d.highRisks} nivel alto`} alert={d.highRisks > 0} />
            <Kpi label="Gaps de seguimiento" value={d.gapTasks} sub="sin resp. o sin plazo" alert={d.gapTasks > 0} last />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Tareas por responsable */}
            <BracketedCard>
              <CardHead title="Carga por responsable" id="D.02 / 01" />
              {d.byResponsible.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-3">
                  {d.byResponsible.map((r) => (
                    <div key={r.name}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="font-display font-bold text-sm">{r.name}</span>
                        <span className="font-mono text-xs text-kir-gris">
                          {r.closed}/{r.total} cerradas
                        </span>
                      </div>
                      <div className="h-3 bg-kir-gris-papel border border-kir-gris-border flex overflow-hidden">
                        <div
                          className="h-full bg-kir-teal"
                          style={{ width: `${pct(r.closed, r.total)}%` }}
                          title={`${r.closed} cerradas`}
                        />
                        <div
                          className="h-full"
                          style={{ width: `${pct(r.pending, r.total)}%`, background: "#B8860B" }}
                          title={`${r.pending} pendientes`}
                        />
                      </div>
                    </div>
                  ))}
                  <Legend
                    items={[
                      { c: "#006B68", t: "Cerradas" },
                      { c: "#B8860B", t: "Pendientes" },
                    ]}
                  />
                </div>
              )}
            </BracketedCard>

            {/* Mapa de riesgos por área */}
            <BracketedCard>
              <CardHead title="Mapa de riesgos · área × nivel" id="D.02 / 02" />
              {d.risksByArea.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-2">
                  {d.risksByArea.map((a) => (
                    <div key={a.area} className="grid grid-cols-[1fr_auto] gap-3 items-center">
                      <span className="font-display font-bold text-xs truncate">{a.area}</span>
                      <div className="flex gap-1">
                        <RiskCell n={a.alta} color="#B23A2C" />
                        <RiskCell n={a.media} color="#B8860B" />
                        <RiskCell n={a.baja} color="#98989A" />
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 mt-1 border-t border-kir-gris-border">
                    <Legend
                      items={[
                        { c: "#B23A2C", t: "Alta" },
                        { c: "#B8860B", t: "Media" },
                        { c: "#98989A", t: "Baja" },
                      ]}
                    />
                  </div>
                </div>
              )}
            </BracketedCard>
          </div>

          {/* Tareas recurrentes no cumplidas */}
          <BracketedCard className="mt-4">
            <CardHead title="Tareas recurrentes sin cerrar" id="D.02 / 03" />
            <p className="text-xs text-kir-gris mb-4 -mt-2">
              Acciones cuyo enunciado aparece en 2 o más reuniones y siguen sin marcarse como completadas. Señal de seguimiento que se arrastra.
            </p>
            {d.recurring.length === 0 ? (
              <div className="text-sm text-kir-teal py-4">
                »» Sin tareas recurrentes detectadas. Buen seguimiento.
              </div>
            ) : (
              <table className="kir-table">
                <thead>
                  <tr>
                    <th>Tarea</th>
                    <th style={{ width: 90, textAlign: "center" }}>Apariciones</th>
                    <th style={{ width: 160 }}>Responsable</th>
                    <th style={{ width: 130 }}>Última reunión</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recurring.map((r, i) => (
                    <tr key={i}>
                      <td>{r.text}</td>
                      <td style={{ textAlign: "center" }}>
                        <Tag variant="alta">{r.count}×</Tag>
                      </td>
                      <td>{r.responsible || <span className="text-kir-gris">— sin asignar —</span>}</td>
                      <td className="font-mono text-xs">{r.lastMeeting}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </BracketedCard>

          <div className="grid grid-cols-2 gap-4 mt-4">
            {/* Tareas pendientes por área */}
            <BracketedCard>
              <CardHead title="Tareas pendientes por área" id="D.02 / 04" />
              {d.pendingByArea.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-3">
                  {d.pendingByArea.map((a) => (
                    <div key={a.area}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="font-display font-bold text-sm">{a.area}</span>
                        <span className="font-mono text-xs text-kir-gris">
                          {a.pending} pend. / {a.total} total
                        </span>
                      </div>
                      <div className="h-3 bg-kir-gris-papel border border-kir-gris-border relative overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${pct(a.total, d.maxAreaPending)}%`,
                            background: "#E2E2E2",
                          }}
                        />
                        <div
                          className="h-full absolute top-0 left-0"
                          style={{
                            width: `${pct(a.pending, d.maxAreaPending)}%`,
                            background: a.pending > 0 ? "#B23A2C" : "#006B68",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <Legend
                    items={[
                      { c: "#B23A2C", t: "Pendientes" },
                      { c: "#E2E2E2", t: "Total tareas" },
                    ]}
                  />
                </div>
              )}
            </BracketedCard>

            {/* Tendencia mensual */}
            <BracketedCard>
              <CardHead title="Tendencia mensual" id="D.02 / 05" />
              {d.monthly.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-3">
                  {d.monthly.map((m) => (
                    <div key={m.key}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="font-mono text-xs">{m.label}</span>
                        <span className="font-mono text-xs text-kir-gris">
                          {m.meetings} reun · {m.tasks} tareas
                        </span>
                      </div>
                      <div className="h-2.5 bg-kir-gris-papel border border-kir-gris-border overflow-hidden">
                        <div
                          className="h-full bg-kir-negro"
                          style={{ width: `${pct(m.tasks, d.maxMonthlyTasks)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </BracketedCard>

            {/* Productividad de seguimiento */}
            <BracketedCard>
              <CardHead title="Productividad de seguimiento" id="D.02 / 06" />
              <div className="space-y-4">
                <Gauge label="Tareas con responsable" value={d.pctWithResponsible} />
                <Gauge label="Tareas con plazo" value={d.pctWithDeadline} />
                <Gauge label="Tareas confirmadas en cierre" value={d.pctConfirmed} />
                <div className="pt-3 border-t border-kir-gris-border flex justify-between items-baseline">
                  <span className="font-display uppercase text-kir-gris" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
                    Promedio tareas / reunión
                  </span>
                  <span className="font-display font-black text-2xl" style={{ letterSpacing: "-0.02em" }}>
                    {d.avgTasksPerMeeting}
                  </span>
                </div>
              </div>
            </BracketedCard>
          </div>
        </>
      )}

      <Actions
        left={<Button variant="ghost" onClick={onBack}>«« Volver al historial</Button>}
        right={<Button variant="primary" onClick={onNext}>Ver mejoras <Chev className="text-white" /></Button>}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers de UI
// ---------------------------------------------------------------------------
function pct(n: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.round((n / total) * 100);
}

function Kpi({
  label,
  value,
  sub,
  alert,
  last,
}: {
  label: string;
  value: number | string;
  sub?: string;
  alert?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`p-6 bg-white ${!last ? "border-r border-kir-negro" : ""}`}>
      <div className="font-display uppercase text-kir-gris mb-2" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
        {label}
      </div>
      <div
        className={`font-display font-black ${alert ? "text-kir-rojo" : ""}`}
        style={{ fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1 }}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-kir-gris mt-2">{sub}</div>}
    </div>
  );
}

function Gauge({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "#006B68" : value >= 40 ? "#B8860B" : "#B23A2C";
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="font-display uppercase text-kir-gris" style={{ fontSize: 9, letterSpacing: "0.22em" }}>
          {label}
        </span>
        <span className="font-mono text-sm font-bold">{value}%</span>
      </div>
      <div className="h-2.5 bg-kir-gris-papel border border-kir-gris-border overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function Legend({ items }: { items: { c: string; t: string }[] }) {
  return (
    <div className="flex gap-4 pt-2">
      {items.map((i) => (
        <div key={i.t} className="flex items-center gap-1.5">
          <span className="w-3 h-3 inline-block border border-kir-gris-border" style={{ background: i.c }} />
          <span className="font-display uppercase text-kir-gris" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
            {i.t}
          </span>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <div className="text-sm text-kir-gris italic py-4">— Sin datos suficientes —</div>;
}

// Celda del mapa de riesgos: cuadro con el conteo; vacío = gris tenue.
function RiskCell({ n, color }: { n: number; color: string }) {
  const has = n > 0;
  return (
    <span
      className="inline-flex items-center justify-center font-display font-black"
      style={{
        width: 34,
        height: 26,
        fontSize: 12,
        border: "1px solid",
        borderColor: has ? color : "#E2E2E2",
        background: has ? color : "#FAFAFA",
        color: has ? "#fff" : "#C8C8C8",
        letterSpacing: "-0.02em",
      }}
      title={`${n}`}
    >
      {has ? n : "·"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Agregaciones
// ---------------------------------------------------------------------------
function computeDashboard(meetings: StoredMeeting[]) {
  const totalMeetings = meetings.length;

  type FlatTask = {
    text: string;
    responsible: string | null;
    deadline: string | null;
    status: string;
    confirmed: boolean;
    meetingName: string;
    area: string;
    date: string;
    savedAt: number;
  };

  const tasks: FlatTask[] = [];
  for (const m of meetings) {
    for (const t of m.analysis?.tasks || []) {
      tasks.push({
        text: t.text,
        responsible: t.responsible,
        deadline: t.deadline,
        status: t.status,
        confirmed: !!t.confirmed,
        meetingName: m.meeting?.name || "(sin nombre)",
        area: (m.meeting?.area || "Sin área").trim() || "Sin área",
        date: m.meeting?.date || "",
        savedAt: m.savedAt || 0,
      });
    }
  }

  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter((t) => isPending(t.status)).length;

  // Riesgos
  let totalRisks = 0;
  let highRisks = 0;
  const areaRisk = new Map<string, { alta: number; media: number; baja: number }>();
  for (const m of meetings) {
    const area = (m.meeting?.area || "Sin área").trim() || "Sin área";
    for (const r of m.analysis?.risks || []) {
      totalRisks++;
      const lvl = (r.level || "").toLowerCase();
      const entry = areaRisk.get(area) || { alta: 0, media: 0, baja: 0 };
      if (lvl.startsWith("alta")) {
        entry.alta++;
        highRisks++;
      } else if (lvl.startsWith("baja")) entry.baja++;
      else entry.media++;
      areaRisk.set(area, entry);
    }
  }
  const risksByArea = Array.from(areaRisk.entries())
    .map(([area, v]) => ({ area, ...v, total: v.alta + v.media + v.baja }))
    .sort((a, b) => b.alta - a.alta || b.total - a.total);
  const maxAreaRisk = Math.max(1, ...risksByArea.map((a) => a.total));

  // Tareas pendientes por area (seguimiento de carga abierta por sector)
  const areaTask = new Map<string, { pending: number; total: number }>();
  for (const t of tasks) {
    const e = areaTask.get(t.area) || { pending: 0, total: 0 };
    e.total++;
    if (isPending(t.status)) e.pending++;
    areaTask.set(t.area, e);
  }
  const pendingByArea = Array.from(areaTask.entries())
    .map(([area, v]) => ({ area, ...v }))
    .filter((a) => a.total > 0)
    .sort((a, b) => b.pending - a.pending || b.total - a.total);
  const maxAreaPending = Math.max(1, ...pendingByArea.map((a) => a.total));

  // Gaps de seguimiento (sin responsable o sin plazo, entre tareas pendientes)
  const gapTasks = tasks.filter(
    (t) =>
      isPending(t.status) &&
      (!t.responsible || /pendiente/i.test(t.responsible) || !t.deadline || /por definir|pendiente/i.test(t.deadline || ""))
  ).length;

  // Por responsable
  const respMap = new Map<string, { total: number; closed: number; pending: number }>();
  for (const t of tasks) {
    const name = t.responsible && !/pendiente/i.test(t.responsible) ? t.responsible : "Sin asignar";
    const e = respMap.get(name) || { total: 0, closed: 0, pending: 0 };
    e.total++;
    if (isClosed(t.status)) e.closed++;
    else e.pending++;
    respMap.set(name, e);
  }
  const byResponsible = Array.from(respMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Tendencia mensual
  const monthMap = new Map<string, { meetings: number; tasks: number }>();
  for (const m of meetings) {
    const date = m.meeting?.date || "";
    const key = date.slice(0, 7); // YYYY-MM
    if (!key) continue;
    const e = monthMap.get(key) || { meetings: 0, tasks: 0 };
    e.meetings++;
    e.tasks += m.analysis?.tasks?.length || 0;
    monthMap.set(key, e);
  }
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const monthly = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([key, v]) => {
      const [y, mo] = key.split("-");
      return {
        key,
        label: `${MESES[parseInt(mo, 10) - 1] || mo} ${y}`,
        meetings: v.meetings,
        tasks: v.tasks,
      };
    });
  const maxMonthlyTasks = Math.max(1, ...monthly.map((m) => m.tasks));

  // Tareas recurrentes no cumplidas (mismo texto en >=2 reuniones, no cerradas)
  const recurMap = new Map<
    string,
    { text: string; count: number; responsible: string | null; lastDate: string; lastMeeting: string; meetingsSeen: Set<string> }
  >();
  for (const t of tasks) {
    if (isClosed(t.status)) continue;
    const key = norm(t.text);
    if (!key || key.length < 8) continue;
    const e =
      recurMap.get(key) ||
      { text: t.text, count: 0, responsible: t.responsible, lastDate: "", lastMeeting: "", meetingsSeen: new Set<string>() };
    const meetingTag = `${t.meetingName}|${t.date}`;
    if (!e.meetingsSeen.has(meetingTag)) {
      e.meetingsSeen.add(meetingTag);
      e.count++;
    }
    if (t.date >= e.lastDate) {
      e.lastDate = t.date;
      e.lastMeeting = t.date ? fmtShort(t.date) : t.meetingName;
      if (t.responsible) e.responsible = t.responsible;
    }
    recurMap.set(key, e);
  }
  const recurring = Array.from(recurMap.values())
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((e) => ({ text: e.text, count: e.count, responsible: e.responsible, lastMeeting: e.lastMeeting }));

  // Productividad de seguimiento
  const withResp = tasks.filter((t) => t.responsible && !/pendiente/i.test(t.responsible)).length;
  const withDeadline = tasks.filter((t) => t.deadline && !/por definir|pendiente/i.test(t.deadline || "")).length;
  const confirmed = tasks.filter((t) => t.confirmed).length;

  return {
    totalMeetings,
    totalTasks,
    pendingTasks,
    totalRisks,
    highRisks,
    gapTasks,
    byResponsible,
    risksByArea,
    maxAreaRisk,
    pendingByArea,
    maxAreaPending,
    monthly,
    maxMonthlyTasks,
    recurring,
    pctWithResponsible: pct(withResp, totalTasks),
    pctWithDeadline: pct(withDeadline, totalTasks),
    pctConfirmed: pct(confirmed, totalTasks),
    avgTasksPerMeeting: totalMeetings ? (totalTasks / totalMeetings).toFixed(1) : "0",
  };
}

function fmtShort(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
