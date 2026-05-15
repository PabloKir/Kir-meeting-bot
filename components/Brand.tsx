// =============================================================================
// KIR Construcciones — Brand helpers
// =============================================================================
// Componentes de marca que se usan en toda la app.
// Logo, chevron, eyebrow, según el Manual de Identidad de KIR.
// =============================================================================

import React from "react";

// Logo oficial extraido del Manual de Identidad Corporativa KIR (pagina 1).
// El asset PNG vive en /public/kir-logo.png (262x115, fondo transparente).
// El prop `size` controla la ALTURA en px; el ancho se ajusta proporcionalmente.
export function LogoKIR({ size = 44 }: { size?: number }) {
  const ratio = 262 / 115; // ancho / alto del asset original
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/kir-logo.png"
      alt="KIR Construcciones"
      title="KIR Construcciones"
      width={Math.round(size * ratio)}
      height={size}
      style={{ display: "block", height: size, width: "auto" }}
    />
  );
}

export function Chev({ kind = "double", className = "" }: { kind?: "single" | "double" | "back"; className?: string }) {
  const text = kind === "back" ? "««" : kind === "single" ? "»" : "»»";
  return (
    <span
      className={`font-display font-black text-kir-teal ${className}`}
      style={{ letterSpacing: "-0.1em" }}
    >
      {text}
    </span>
  );
}

export function Eyebrow({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`font-display font-bold text-[10px] uppercase inline-flex items-center gap-2 ${
        muted ? "text-kir-gris" : "text-kir-negro"
      }`}
      style={{ letterSpacing: "0.22em" }}
    >
      <Chev />
      {children}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  subtitle,
  meta,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  meta?: { num: string; label?: string };
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-6 items-end mb-8 pb-5 border-b border-kir-negro">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1
          className="font-display font-black uppercase mt-3"
          style={{ fontSize: 48, letterSpacing: "-0.025em", lineHeight: 1.05 }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-kir-gris text-sm mt-3 max-w-[640px] leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {meta && (
        <div className="text-right font-mono text-[11px] text-kir-gris">
          <span
            className="block font-display font-black text-kir-teal"
            style={{ fontSize: 18, letterSpacing: "-0.02em" }}
          >
            {meta.num}
          </span>
          {meta.label}
        </div>
      )}
    </div>
  );
}

export function BracketedCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative bg-white border border-kir-negro p-8 mb-4 ${className}`}>
      {/* Corner brackets */}
      <span className="absolute top-[-1px] left-[-1px] w-3.5 h-3.5 border-t-2 border-l-2 border-kir-teal" />
      <span className="absolute top-[-1px] right-[-1px] w-3.5 h-3.5 border-t-2 border-r-2 border-kir-teal" />
      <span className="absolute bottom-[-1px] left-[-1px] w-3.5 h-3.5 border-b-2 border-l-2 border-kir-teal" />
      <span className="absolute bottom-[-1px] right-[-1px] w-3.5 h-3.5 border-b-2 border-r-2 border-kir-teal" />
      {children}
    </div>
  );
}

export function CardHead({ title, id }: { title: string; id?: string }) {
  return (
    <div className="flex justify-between items-baseline mb-5 pb-3 border-b border-kir-gris-border">
      <h3
        className="font-display font-black uppercase"
        style={{ fontSize: 18, letterSpacing: "-0.02em" }}
      >
        {title}
      </h3>
      {id && <span className="font-mono text-[10px] text-kir-gris">{id}</span>}
    </div>
  );
}

export function Button({
  children,
  variant = "default",
  size = "md",
  ...props
}: {
  children: React.ReactNode;
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center gap-2.5 font-display font-bold uppercase cursor-pointer transition-all duration-100 border";
  const sizes = {
    sm: "px-3 py-1.5 text-[10px]",
    md: "px-5 py-3 text-[11px]",
  };
  const variants = {
    default:
      "bg-white border-kir-negro text-kir-negro hover:bg-kir-negro hover:text-white",
    primary:
      "bg-kir-negro border-kir-negro text-white hover:bg-kir-teal-dark",
    ghost:
      "bg-white border-kir-gris-border text-kir-negro hover:bg-kir-negro hover:text-white hover:border-kir-negro",
    danger:
      "bg-white border-kir-rojo text-kir-rojo hover:bg-kir-rojo hover:text-white",
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} disabled:opacity-40 disabled:cursor-not-allowed`}
      style={{ letterSpacing: "0.18em", borderRadius: 0 }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Tag({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "teal" | "solid" | "alta" | "media" | "baja" | "ok";
}) {
  const variants = {
    default: "border-kir-gris text-kir-gris bg-white",
    teal: "border-kir-teal text-kir-teal bg-white",
    solid: "bg-kir-negro text-white border-kir-negro",
    alta: "bg-kir-rojo text-white border-kir-rojo",
    media: "bg-kir-amber text-white border-kir-amber",
    baja: "bg-kir-gris text-white border-kir-gris",
    ok: "border-kir-teal text-kir-teal bg-kir-teal-soft",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 font-display font-bold text-[9px] uppercase border ${variants[variant]}`}
      style={{ letterSpacing: "0.18em" }}
    >
      {children}
    </span>
  );
}

export function Alert({
  variant = "info",
  title,
  children,
}: {
  variant?: "info" | "warn";
  title?: string;
  children: React.ReactNode;
}) {
  const border = variant === "warn" ? "border-kir-rojo" : "border-kir-negro";
  const icoColor = variant === "warn" ? "text-kir-rojo" : "text-kir-teal";
  return (
    <div className={`p-4 px-5 border bg-white grid grid-cols-[auto_1fr] gap-4 items-start mb-4 ${border}`}>
      <span
        className={`font-display font-black text-lg pt-0.5 ${icoColor}`}
        style={{ letterSpacing: "-0.1em" }}
      >
        »»
      </span>
      <div>
        {title && (
          <div
            className="font-display font-bold text-[11px] uppercase mb-1"
            style={{ letterSpacing: "0.18em" }}
          >
            {title}
          </div>
        )}
        <div className="text-sm text-kir-negro leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
