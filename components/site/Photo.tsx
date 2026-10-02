"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Imagem que, se o ficheiro ainda não existir, mostra um placeholder elegante
 * com o caminho a preencher (ex.: public/fotos/hero.jpg) em vez de partir.
 */
export function Photo({
  src,
  alt,
  className,
  label,
  priority,
  compact,
}: {
  src: string;
  alt: string;
  className?: string;
  label?: string;
  priority?: boolean;
  /** placeholder discreto num canto (para não colidir com controlos ao centro) */
  compact?: "left" | "right";
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // se a imagem falhou antes de o React ligar o onError (carregamento rápido), deteta aqui
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "relative grid place-items-center overflow-hidden bg-[radial-gradient(120%_80%_at_30%_20%,oklch(0.32_0.03_75),oklch(0.17_0.008_60))]",
          className,
        )}
      >
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full opacity-[0.12]" aria-hidden>
          <path d="M40 180 C 60 90, 140 120, 120 20" fill="none" stroke="currentColor" strokeWidth="0.6" className="text-accent" />
          <path d="M70 190 C 90 100, 170 130, 150 30" fill="none" stroke="currentColor" strokeWidth="0.6" className="text-accent" />
          <path d="M10 170 C 30 80, 110 110, 90 10" fill="none" stroke="currentColor" strokeWidth="0.6" className="text-accent" />
        </svg>
        {compact ? (
          <p className={cn("absolute bottom-4 font-mono text-[10px] text-foreground/40", compact === "left" ? "left-4" : "right-4")}>
            public{src}
          </p>
        ) : (
          <div className="relative text-center">
            <p className="font-serif text-4xl text-accent/80 italic">B</p>
            {label && <p className="mt-1 font-label text-[10px] tracking-[0.25em] text-foreground/60 uppercase">{label}</p>}
            <p className="mt-2 font-mono text-[10px] text-foreground/35">public{src}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- fotos locais/Storage; o fallback precisa do onError
    <img
      ref={img}
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      loading={priority ? "eager" : "lazy"}
      className={cn("object-cover", className)}
    />
  );
}
