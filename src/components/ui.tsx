"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "@phosphor-icons/react";
import { money } from "@/lib/format";
import { PAYMENT_LABEL, type PaymentMethod } from "@/lib/types";

/* ---------- Superficies ---------- */

export function Card({
  children,
  className = "",
  index = 0,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <section
      className={`card reveal p-6 transition-shadow duration-200 hover:shadow-lift sm:p-8 ${className}`}
      style={{ ["--index" as string]: index }}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-serif text-3xl leading-tight tracking-[-0.02em] sm:text-4xl">
          {title}
        </h1>
      </div>
      {action}
    </div>
  );
}

/* ---------- Cifras ---------- */

export function Stat({
  label,
  value,
  hint,
  size = "md",
  tone = "ink",
}: {
  label: string;
  value: number;
  hint?: string;
  size?: "md" | "lg";
  tone?: "ink" | "muted" | "credito";
}) {
  const toneClass =
    tone === "credito" ? "text-credito-fg" : tone === "muted" ? "text-muted" : "text-ink";
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <p
        className={`num tracking-[-0.02em] ${toneClass} ${
          size === "lg" ? "text-5xl sm:text-6xl" : "text-2xl"
        }`}
      >
        {money(value)}
      </p>
      {hint ? <p className="mt-2 text-[13px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

/* ---------- Etiquetas ---------- */

const PAYMENT_TONE: Record<PaymentMethod, string> = {
  efectivo: "bg-efectivo-bg text-efectivo-fg",
  sinpe: "bg-sinpe-bg text-sinpe-fg",
  tarjeta: "bg-tarjeta-bg text-tarjeta-fg",
};

export function PaymentTag({ method }: { method: PaymentMethod }) {
  return <span className={`tag ${PAYMENT_TONE[method]}`}>{PAYMENT_LABEL[method]}</span>;
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "credito" | "efectivo" | "sinpe" | "tarjeta";
}) {
  const tones = {
    neutral: "bg-surface text-muted",
    credito: "bg-credito-bg text-credito-fg",
    efectivo: "bg-efectivo-bg text-efectivo-fg",
    sinpe: "bg-sinpe-bg text-sinpe-fg",
    tarjeta: "bg-tarjeta-bg text-tarjeta-fg",
  };
  return <span className={`tag ${tones[tone]}`}>{children}</span>;
}

/* ---------- Selector de metodo de pago ---------- */

export function PaymentPicker({
  value,
  onChange,
  name = "payment",
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  name?: string;
}) {
  const methods: PaymentMethod[] = ["efectivo", "sinpe", "tarjeta"];
  return (
    <div role="radiogroup" aria-label="Metodo de pago" className="grid grid-cols-3 gap-2">
      {methods.map((m) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            name={name}
            onClick={() => onChange(m)}
            className={`rounded-control border px-3 py-2.5 text-sm transition-transform duration-150 active:scale-[0.98] ${
              active
                ? "border-ink bg-ink text-paper"
                : "border-line bg-paper text-muted hover:bg-surface"
            }`}
          >
            {PAYMENT_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Mensajes ---------- */

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-control border border-credito-fg/20 bg-credito-bg px-3 py-2 text-[13px] text-credito-fg"
    >
      {message}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-10 text-center text-[14px] text-muted">{children}</p>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Enfocar el primer campo SOLO al abrir. Si esto dependiera de onClose (que
  // varios modales recrean en cada render), se re-ejecutaria en cada tecla y le
  // robaria el foco a la casilla que se esta escribiendo.
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("input, select, button")?.focus();
  }, [open]);

  // Cerrar con Escape. Puede re-suscribirse si cambia onClose: no toca el foco.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-t-card border border-line bg-paper p-6 sm:rounded-card sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="font-serif text-2xl tracking-[-0.02em]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-control p-1 text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <XIcon size={18} weight="bold" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
