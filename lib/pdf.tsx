// =============================================================================
// PDF FOG-11 Rev.2 server-side (para adjuntar al email de distribución)
// =============================================================================
// Generado con @react-pdf/renderer (sin chromium, corre en serverless).
// Layout alineado al formulario FOG-11 oficial de KIR S.A.
// =============================================================================

import React from "react";
import crypto from "node:crypto";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Analysis, Meeting, Participant } from "./types";

// =============================================================================
// Sello de integridad ("PDF firmado"): SHA-256 sobre el contenido canónico de
// la minuta + ID + fecha de emisión. No es firma criptográfica X.509: es una
// huella de integridad verificable (si alguien edita el PDF, el hash deja de
// coincidir con el contenido). Liviano, sin certificados.
// =============================================================================
export interface MinuteIntegrity {
  minuteId: string;
  hash: string; // sha256 hex
  issuedAt: string; // ISO
}

export function computeIntegrity(
  meeting: Meeting,
  participants: Participant[],
  analysis: Analysis,
  minuteId?: string
): MinuteIntegrity {
  // Objeto canónico en orden fijo para que el hash sea reproducible.
  const canonical = JSON.stringify({
    meeting: {
      name: meeting.name,
      date: meeting.date,
      time: meeting.time,
      area: meeting.area,
      objective: meeting.objective,
      type: meeting.type,
    },
    participants: participants.map((p) => ({
      name: p.name,
      initials: p.initials,
      role: p.role,
      attended: p.attended,
    })),
    analysis: {
      executiveSummary: analysis.executiveSummary,
      topics: analysis.topics,
      decisions: analysis.decisions,
      tasks: analysis.tasks.map((t) => ({
        text: t.text,
        responsible: t.responsible,
        deadline: t.deadline,
        dueDate: t.dueDate ?? null,
        priority: t.priority,
        status: t.status,
      })),
      risks: analysis.risks,
      openQuestions: analysis.openQuestions,
      nextSteps: analysis.nextSteps,
    },
  });
  const hash = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  const id =
    minuteId ||
    `KIR-${(meeting.date || "").replace(/-/g, "")}-${hash.slice(0, 8).toUpperCase()}`;
  return { minuteId: id, hash, issuedAt: new Date().toISOString() };
}

const NEGRO = "#222222";
const GRIS = "#98989A";
const TEAL = "#006B68";
const ROJO = "#B23A2C";
const BORDE = "#cccccc";

const s = StyleSheet.create({
  page: { padding: 34, fontSize: 9, fontFamily: "Helvetica", color: NEGRO, lineHeight: 1.45 },
  topbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: NEGRO,
    paddingBottom: 8,
    marginBottom: 6,
  },
  logo: { height: 40, objectFit: "contain" },
  formulario: { textAlign: "right" },
  formularioB: { fontFamily: "Helvetica-Bold", color: TEAL, fontSize: 9 },
  formularioT: { fontSize: 7, color: GRIS, marginTop: 2 },
  titleBar: {
    backgroundColor: NEGRO,
    color: "#fff",
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  titleH1: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#fff", letterSpacing: 1 },
  titleMeta: { fontSize: 8, color: "#fff" },
  cab: { borderWidth: 1, borderColor: NEGRO, borderTopWidth: 0 },
  cabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: NEGRO },
  cabRowLast: { flexDirection: "row" },
  cabLabel: {
    width: "20%",
    backgroundColor: "#f2f2f2",
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: NEGRO,
  },
  cabValue: { padding: 5, fontSize: 8.5, flexGrow: 1 },
  cabSep: { borderRightWidth: 1, borderRightColor: NEGRO },
  asisHead: {
    flexDirection: "row",
    backgroundColor: NEGRO,
    borderWidth: 1,
    borderColor: NEGRO,
    borderTopWidth: 0,
  },
  asisHeadCell: {
    width: "50%",
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    padding: 5,
  },
  asisBody: { flexDirection: "row", borderWidth: 1, borderColor: NEGRO, borderTopWidth: 0 },
  asisCell: { width: "50%", padding: 6, fontSize: 8.5 },
  asisCellSep: { borderRightWidth: 1, borderRightColor: NEGRO },
  person: { marginBottom: 2 },
  check: { color: TEAL, fontFamily: "Helvetica-Bold" },
  nota: {
    borderWidth: 1,
    borderColor: NEGRO,
    borderTopWidth: 0,
    padding: 6,
    fontSize: 7.5,
    backgroundColor: "#fafafa",
    lineHeight: 1.5,
  },
  metaRow: { flexDirection: "row", borderWidth: 1, borderColor: NEGRO, borderTopWidth: 0 },
  metaCell: { width: "50%", padding: 5, fontSize: 8 },
  metaB: { fontFamily: "Helvetica-Bold", color: TEAL },
  section: { marginTop: 16 },
  secH: {
    backgroundColor: NEGRO,
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    padding: 5,
    flexDirection: "row",
  },
  secNum: { color: GRIS, marginRight: 8 },
  secBody: { borderWidth: 1, borderColor: NEGRO, borderTopWidth: 0, padding: 8 },
  empty: { color: GRIS, fontStyle: "italic" },
  tableHead: { flexDirection: "row", backgroundColor: "#f2f2f2", borderBottomWidth: 1, borderBottomColor: BORDE },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, padding: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDE },
  td: { fontSize: 8, padding: 4 },
  cNum: { width: "8%", color: TEAL, textAlign: "center" },
  cDesc: { width: "62%" },
  cR: { width: "12%", textAlign: "center", fontFamily: "Helvetica-Bold" },
  cPlazo: { width: "18%" },
  li: { flexDirection: "row", marginBottom: 3 },
  liBullet: { color: TEAL, fontFamily: "Helvetica-Bold", marginRight: 6 },
  liText: { flexGrow: 1, flexBasis: 0 },
  prioAlta: { color: ROJO, fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  sello: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: TEAL,
    backgroundColor: "#f3f8f7",
    padding: 8,
  },
  selloH: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: TEAL,
    marginBottom: 4,
    letterSpacing: 1,
  },
  selloRow: { flexDirection: "row", marginBottom: 2 },
  selloK: { width: "28%", fontFamily: "Helvetica-Bold", fontSize: 7.5, color: GRIS },
  selloV: { width: "72%", fontSize: 7.5 },
  selloHash: { fontFamily: "Courier", fontSize: 7, color: NEGRO },
  firmaRow: { flexDirection: "row", marginTop: 10, justifyContent: "space-between" },
  firmaBox: { width: "46%" },
  firmaLine: { borderTopWidth: 1, borderTopColor: NEGRO, marginTop: 22, paddingTop: 3 },
  firmaCap: { fontSize: 7, color: GRIS, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 34,
    right: 34,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: NEGRO,
    paddingTop: 6,
    fontSize: 7,
    color: GRIS,
  },
});

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function Bullets({ items }: { items: string[] }) {
  if (!items || items.length === 0) return <Text style={s.empty}>— Sin registros —</Text>;
  return (
    <View>
      {items.map((t, i) => (
        <View style={s.li} key={i}>
          <Text style={s.liBullet}>»</Text>
          <Text style={s.liText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export interface MinutePDFProps {
  meeting: Meeting;
  participants: Participant[];
  analysis: Analysis;
  logoUrl?: string;
  minuteId?: string;
}

function fmtStamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())} hs`;
}

function MinuteDocument({ meeting, participants, analysis, logoUrl, minuteId }: MinutePDFProps) {
  const asistentes = participants.filter((p) => p.attended);
  const conCopia = participants.filter((p) => !p.attended);
  const facilitador = participants.find((p) => p.role === "Facilitador");
  const responsableDecision = participants.find((p) => p.role === "Responsable de decisión");
  const integ = computeIntegrity(meeting, participants, analysis, minuteId);

  return (
    <Document title={`Minuta ${meeting.name} — KIR S.A.`} author="KIR S.A. Meeting Agent">
      <Page size="A4" style={s.page}>
        <View style={s.topbar}>
          {logoUrl ? <Image src={logoUrl} style={s.logo} /> : <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16 }}>KIR S.A.</Text>}
          <View style={s.formulario}>
            <Text style={s.formularioB}>Formulario: FOG-11 Rev.2</Text>
            <Text style={s.formularioT}>KIR S.A. — Pasión por crear</Text>
          </View>
        </View>

        <View style={s.titleBar}>
          <Text style={s.titleH1}>MINUTA DE REUNIÓN</Text>
          <Text style={s.titleMeta}>Versión: 0</Text>
        </View>

        <View style={s.cab}>
          <View style={s.cabRow}>
            <Text style={s.cabLabel}>FECHA</Text>
            <Text style={[s.cabValue, s.cabSep]}>{fmtDate(meeting.date)} — {meeting.time} hs</Text>
            <Text style={s.cabLabel}>OBRA / SECTOR</Text>
            <Text style={s.cabValue}>{meeting.area || "—"}</Text>
          </View>
          <View style={s.cabRow}>
            <Text style={s.cabLabel}>OBJETO</Text>
            <Text style={s.cabValue}>{meeting.objective || meeting.name}</Text>
          </View>
          <View style={s.cabRowLast}>
            <Text style={s.cabLabel}>TIPO</Text>
            <Text style={[s.cabValue, s.cabSep]}>{meeting.type}</Text>
            <Text style={s.cabLabel}>DURACIÓN</Text>
            <Text style={s.cabValue}>{meeting.expectedDuration} min</Text>
          </View>
        </View>

        <View style={s.asisHead}>
          <Text style={[s.asisHeadCell, { borderRightWidth: 1, borderRightColor: "#444" }]}>
            ASISTENTES ({asistentes.length})
          </Text>
          <Text style={s.asisHeadCell}>CON COPIA ({conCopia.length})</Text>
        </View>
        <View style={s.asisBody}>
          <View style={[s.asisCell, s.asisCellSep]}>
            {asistentes.length === 0 ? (
              <Text>—</Text>
            ) : (
              asistentes.map((p) => (
                <Text style={s.person} key={p.id}>
                  <Text style={s.check}>X </Text>
                  {p.name} ({p.initials})
                </Text>
              ))
            )}
          </View>
          <View style={s.asisCell}>
            {conCopia.length === 0 ? (
              <Text>—</Text>
            ) : (
              conCopia.map((p) => (
                <Text style={s.person} key={p.id}>
                  <Text style={s.check}>X </Text>
                  {p.name} ({p.initials})
                </Text>
              ))
            )}
          </View>
        </View>

        <View style={s.metaRow}>
          <Text style={[s.metaCell, s.cabSep]}>
            <Text style={s.metaB}>Minuta elaborada por: </Text>
            {facilitador?.name || "—"}
          </Text>
          <Text style={s.metaCell}>
            <Text style={s.metaB}>Próxima reunión: </Text>a definir
          </Text>
        </View>

        <View style={s.nota}>
          <Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>NOTA: </Text>
            Si cualquiera de los ítems aquí desarrollados estuviere incompleto o fuere incorrecto, por favor notificar al emisor de la minuta. El no hacerlo dentro de los cinco días de emitida o antes de la próxima reunión (lo que ocurra primero) constituye aceptación de la información contenida y como ésta es presentada.
          </Text>
        </View>

        {analysis.executiveSummary ? (
          <View style={s.section}>
            <View style={s.secH}>
              <Text style={s.secNum}>01</Text>
              <Text>RESUMEN EJECUTIVO</Text>
            </View>
            <View style={s.secBody}>
              <Text>{analysis.executiveSummary}</Text>
            </View>
          </View>
        ) : null}

        <View style={s.section}>
          <View style={s.secH}>
            <Text style={s.secNum}>02</Text>
            <Text>ACCIONES — TAREAS, RESPONSABLES, PLAZOS</Text>
          </View>
          <View style={s.secBody}>
            {analysis.tasks.length === 0 ? (
              <Text style={s.empty}>— Sin acciones registradas —</Text>
            ) : (
              <View>
                <View style={s.tableHead}>
                  <Text style={[s.th, s.cNum]}>N°</Text>
                  <Text style={[s.th, s.cDesc]}>Descripción</Text>
                  <Text style={[s.th, s.cR]}>R</Text>
                  <Text style={[s.th, s.cPlazo]}>Plazo</Text>
                </View>
                {analysis.tasks.map((t, i) => {
                  const resp = participants.find((p) => p.name === t.responsible);
                  const ini =
                    resp?.initials ||
                    (t.responsible
                      ? t.responsible.split(" ").map((w) => w[0]).join("").toUpperCase()
                      : "—");
                  return (
                    <View style={s.tr} key={i} wrap={false}>
                      <Text style={[s.td, s.cNum]}>{String(i + 1).padStart(2, "0")}</Text>
                      <Text style={[s.td, s.cDesc]}>
                        {t.text}
                        {t.priority === "Alta" ? <Text style={s.prioAlta}>  [ALTA]</Text> : null}
                      </Text>
                      <Text style={[s.td, s.cR]}>{ini}</Text>
                      <Text style={[s.td, s.cPlazo]}>
                        {t.dueDate
                          ? (() => { const [y, m, d] = t.dueDate!.split("-"); return `${d}/${m}/${y}`; })()
                          : t.deadline || "Inmediato"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        <View style={s.section} wrap={false}>
          <View style={s.secH}>
            <Text style={s.secNum}>03</Text>
            <Text>DECISIONES TOMADAS</Text>
          </View>
          <View style={s.secBody}>
            <Bullets items={analysis.decisions} />
          </View>
        </View>

        <View style={s.section} wrap={false}>
          <View style={s.secH}>
            <Text style={s.secNum}>04</Text>
            <Text>RIESGOS Y BLOQUEOS</Text>
          </View>
          <View style={s.secBody}>
            {analysis.risks.length === 0 ? (
              <Text style={s.empty}>— Sin riesgos registrados —</Text>
            ) : (
              analysis.risks.map((r, i) => (
                <View style={s.li} key={i}>
                  <Text style={s.liBullet}>»</Text>
                  <Text style={s.liText}>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>[{(r.level || "").toUpperCase()}] </Text>
                    {r.text}
                    {r.mitigation ? <Text style={{ color: GRIS }}>  — Mitigación: {r.mitigation}</Text> : null}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={s.section} wrap={false}>
          <View style={s.secH}>
            <Text style={s.secNum}>05</Text>
            <Text>PREGUNTAS ABIERTAS</Text>
          </View>
          <View style={s.secBody}>
            <Bullets items={analysis.openQuestions} />
          </View>
        </View>

        <View style={s.section} wrap={false}>
          <View style={s.secH}>
            <Text style={s.secNum}>06</Text>
            <Text>PRÓXIMOS PASOS</Text>
          </View>
          <View style={s.secBody}>
            <Bullets items={analysis.nextSteps} />
          </View>
        </View>

        <View style={s.sello} wrap={false}>
          <Text style={s.selloH}>VALIDACIÓN E INTEGRIDAD DEL DOCUMENTO</Text>
          <View style={s.selloRow}>
            <Text style={s.selloK}>ID de minuta</Text>
            <Text style={s.selloV}>{integ.minuteId}</Text>
          </View>
          <View style={s.selloRow}>
            <Text style={s.selloK}>Emitida</Text>
            <Text style={s.selloV}>{fmtStamp(integ.issuedAt)}</Text>
          </View>
          <View style={s.selloRow}>
            <Text style={s.selloK}>Huella SHA-256</Text>
            <Text style={[s.selloV, s.selloHash]}>{integ.hash}</Text>
          </View>
          <Text style={{ fontSize: 6.5, color: GRIS, marginTop: 3 }}>
            Sello de integridad. Si el contenido se altera, esta huella deja de coincidir.
            Verificable recalculando el SHA-256 del contenido canónico de la minuta.
          </Text>
          <View style={s.firmaRow}>
            <View style={s.firmaBox}>
              <View style={s.firmaLine} />
              <Text style={s.firmaCap}>ELABORADA POR</Text>
              <Text style={{ fontSize: 8 }}>{facilitador?.name || "—"}</Text>
            </View>
            <View style={s.firmaBox}>
              <View style={s.firmaLine} />
              <Text style={s.firmaCap}>VALIDADA POR</Text>
              <Text style={{ fontSize: 8 }}>{responsableDecision?.name || "—"}</Text>
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>R: Responsable de ejecutar la acción · Generado por KIR Meeting Agent</Text>
          <Text>FOG-11 Rev.2 — Minuta Reunión de Gerencia</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderMinutePDF(props: MinutePDFProps): Promise<Buffer> {
  return renderToBuffer(<MinuteDocument {...props} />);
}
