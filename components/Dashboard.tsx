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
  const d = useMemo(() => computeDashboard(visible), [visible]);

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

      {visible.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 border border-kir-negro mb-6">
            <Kpi label="Reuniones" value={d.totalMeetings} />
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

            {/* Riesgos por área */}
            <BracketedCard>
              <CardHead title="Riesgos por área" id="D.02 / 02" />
              {d.risksByArea.length === 0 ? (
                <Empty />
              ) : (
                <table className="kir-table">
                  <thead>
                    <tr>
                      <th>Área</th>
                      <th style={{ textAlign: "center", width: 60 }}>Alta</th>
                      <th style={{ textAlign: "center", width: 60 }}>Media</th>
                      <th style={{ textAlign: "center", width: 60 }}>Baja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.risksByArea.map((a) => (
                      <tr key={a.area}>
                        <td>{a.area}</td>
                        <td style={{ textAlign: "center" }}>
                          {a.alta > 0 ? <Tag variant="alta">{a.alta}</Tag> : <span className="text-kir-gris">—</span>}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {a.media > 0 ? <Tag variant="media">{a.media}</Tag> : <span className="text-kir-gris">—</span>}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {a.baja > 0 ? <Tag variant="baja">{a.baja}</Tag> : <span className="text-kir-gris">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            {/* Tendencia mensual */}
            <BracketedCard>
              <CardHead title="Tendencia mensual" id="D.02 / 04" />
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
              <CardHead title="Productividad de seguimiento" id="D.02 / 05" />
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
