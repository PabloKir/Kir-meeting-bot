"use client";

import { useStore } from "@/lib/store";
import { LogoKIR } from "./Brand";

export function Header() {
  const meeting = useStore((s) => s.meeting);
  const participants = useStore((s) => s.participants);
  const capture = useStore((s) => s.capture);
  const attendingCount = participants.filter((p) => p.attended).length;

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const statusInfo = (() => {
    switch (capture.status) {
      case "recording":     return { txt: "Grabando",       cls: "kir-pulse", dot: "#B23A2C" };
      case "uploading":     return { txt: "Subiendo audio", cls: "kir-pulse", dot: "#B8860B" };
      case "transcribing":  return { txt: "Transcribiendo", cls: "kir-pulse", dot: "#B8860B" };
      case "transcribed":   return { txt: "Transcripto",    cls: "",          dot: "#006B68" };
      case "failed":        return { txt: "Error",          cls: "",          dot: "#B23A2C" };
      default:              return { txt: "Inactivo",       cls: "",          dot: "#98989A" };
    }
  })();

  return (
    <header className="grid grid-cols-[280px_1fr] border-b border-kir-negro bg-white h-16">
      <div className="border-r border-kir-negro flex items-center px-6 gap-4">
        <LogoKIR />
        <div
          className="border-l border-kir-gris-border pl-4 font-display uppercase text-kir-gris"
          style={{ fontSize: 9.5, letterSpacing: "0.22em", lineHeight: 1.3 }}
        >
          <b className="block text-kir-negro font-extrabold" style={{ fontSize: 11, letterSpacing: "0.18em" }}>
            Meeting Agent
          </b>
          Asistente de reuniones
        </div>
      </div>
      <div className="flex items-center justify-between px-6">
        <div className="flex gap-6 items-center">
          <MetaItem label="Sesión" value={meeting.name || "—"} truncate />
          <MetaItem label="Fecha" value={fmtDate(meeting.date)} />
          <MetaItem label="Participantes" value={String(attendingCount)} />
        </div>
        <div
          className="inline-flex items-center gap-2 border border-kir-negro px-3 py-1.5 font-display uppercase font-bold"
          style={{ fontSize: 10, letterSpacing: "0.22em" }}
        >
          <span
            className={`w-2 h-2 rounded-full ${statusInfo.cls}`}
            style={{ background: statusInfo.dot }}
          />
          {statusInfo.txt}
        </div>
      </div>
    </header>
  );
}

function MetaItem({ label, value, truncate = false }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="flex flex-col">
      <span
        className="font-display uppercase text-kir-gris"
        style={{ fontSize: 9, letterSpacing: "0.22em" }}
      >
        {label}
      </span>
      <span
        className={`font-mono text-kir-negro ${truncate ? "max-w-[280px] truncate" : ""}`}
        style={{ fontSize: 12 }}
      >
        {value}
      </span>
    </div>
  );
}
