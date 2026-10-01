"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Peças visuais do painel do gerente (preto + dourado, como o modelo).

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-gold/25 bg-[#141210] p-5 sm:p-6", className)}>{children}</div>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-serif text-2xl">{children}</h2>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block font-label text-[11px] tracking-[0.2em] text-gold uppercase">{children}</span>;
}

export const inputCls =
  "w-full rounded-xl border border-gold/25 bg-black/40 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-gold/70";

export function Field({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={cn("block", className)}>
      {label && <Label>{label}</Label>}
      <input {...props} className={cn(inputCls, props.type === "time" && "font-mono")} />
    </label>
  );
}

export function TextArea({ label, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className={cn("block", className)}>
      {label && <Label>{label}</Label>}
      <textarea {...props} className={cn(inputCls, "min-h-28 resize-y leading-relaxed")} />
    </label>
  );
}

export function Btn({
  variant = "gold",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "gold" | "ghost" | "danger" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 font-label text-[11px] tracking-[0.2em] uppercase transition disabled:opacity-50",
        variant === "gold" && "bg-gold text-black hover:brightness-110",
        variant === "ghost" && "border border-gold/30 text-gold hover:border-gold/70",
        variant === "danger" && "border border-red-400/40 text-red-300 hover:bg-red-500/10",
        className,
      )}
    />
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full border transition", on ? "border-gold bg-gold/80" : "border-white/10 bg-white/10")}
    >
      <span className={cn("absolute top-0.5 size-5.5 rounded-full transition-all", on ? "left-6 bg-black" : "left-0.5 bg-[#8d8578]")} />
    </button>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-sm text-muted-foreground">{children}</p>;
}

/** Mensagem curta de "guardado"/erro que desaparece sozinha. */
export function useFlash() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <p role="status" className={cn("text-sm", msg.error ? "text-red-300" : "text-emerald-300")}>
      {msg.text}
    </p>
  ) : null;
  return {
    node,
    show: (r: { ok: boolean; error?: string }, okText = "Guardado ✓") => setMsg(r.ok ? { text: okText } : { text: r.error ?? "Erro", error: true }),
  };
}

export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "Por confirmar", cls: "border-amber-400/50 text-amber-300" },
  confirmed: { text: "Confirmado", cls: "border-emerald-400/50 text-emerald-300" },
  in_progress: { text: "Em atendimento", cls: "border-sky-400/50 text-sky-300" },
  completed: { text: "Concluído", cls: "border-gold/50 text-gold" },
  cancelled: { text: "Cancelado", cls: "border-white/15 text-muted-foreground line-through" },
  no_show: { text: "Faltou", cls: "border-red-400/50 text-red-300" },
};
