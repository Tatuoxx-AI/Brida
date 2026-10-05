"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Seda em vídeo tingida de dourado (do modelo "AI HR Manager"). Só descarrega/toca quando
// está perto do ecrã; com "reduzir movimento" ligado fica só o brilho dourado.

const SILK = "https://cdn.jiro.build/Tanvir/bg/silk-1770305242948%20(1).mp4";

export function SilkBackground({ className, children }: { className?: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (!v.src) v.src = SILK;
          v.play().catch(() => {});
        } else v.pause();
      },
      { rootMargin: "200px" },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <div className={cn("pointer-events-none absolute inset-0 z-0 size-full overflow-hidden bg-black", className)} aria-hidden>
      <video
        ref={ref}
        loop
        muted
        playsInline
        preload="none"
        className="absolute inset-0 size-full object-cover opacity-80"
        style={{ filter: "grayscale(1) sepia(1) saturate(3.2) hue-rotate(-6deg) brightness(0.85) contrast(1.15)" }}
      />
      {/* brilho dourado (também serve de fundo enquanto o vídeo carrega) */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 45% at 50% 25%, rgba(246, 207, 87, 0.16) 0%, rgba(0, 0, 0, 0) 70%)" }} />
      {children}
    </div>
  );
}
