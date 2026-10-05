"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo interativo: fios dourados (como madeixas) fixos atrás do site.
 * - Ao descer, os fios desenham-se e curvam no sentido do scroll; ao subir, recolhem
 *   e curvam para o lado oposto.
 * - Cada fio tem a sua velocidade (parallax) e volta a assentar quando o scroll pára.
 * - Com "reduzir movimento" ligado ficam parados.
 */
const STRANDS = [
  { x: 0.06, speed: 0.18, width: 1.2, opacity: 0.5, phase: 0.0, curl: 240 },
  { x: 0.14, speed: 0.32, width: 0.8, opacity: 0.32, phase: 1.3, curl: 180 },
  { x: 0.78, speed: 0.22, width: 1.4, opacity: 0.55, phase: 2.1, curl: 260 },
  { x: 0.86, speed: 0.4, width: 0.9, opacity: 0.38, phase: 0.7, curl: 200 },
  { x: 0.93, speed: 0.12, width: 0.7, opacity: 0.3, phase: 2.8, curl: 160 },
  { x: 0.5, speed: 0.08, width: 0.6, opacity: 0.16, phase: 1.9, curl: 300 },
  { x: 0.33, speed: 0.26, width: 0.7, opacity: 0.2, phase: 0.4, curl: 220 },
];

export function ScrollVeins() {
  const svg = useRef<SVGSVGElement>(null);
  const paths = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = window.innerWidth;
    let h = Math.max(1, window.innerHeight); // 0 numa janela escondida daria NaN no "%"
    let lastY = window.scrollY;
    let velocity = 0; // suavizada, positiva a descer
    let bend = 0;
    let t = 0;
    let raf = 0;

    const resize = () => {
      w = window.innerWidth;
      h = Math.max(1, window.innerHeight);
      el.setAttribute("viewBox", `0 0 ${w} ${h}`);
    };

    const draw = () => {
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - h);
      const progress = Math.min(1, y / max);
      const dy = y - lastY;
      lastY = y;

      velocity += (dy - velocity) * 0.18;
      // curva para o lado do movimento e assenta devagar quando pára
      bend += (Math.max(-160, Math.min(160, velocity * 3.2)) - bend) * (reduced ? 0.5 : 0.08);
      t += 0.004 + Math.abs(velocity) * 0.0009;

      STRANDS.forEach((s, i) => {
        const p = paths.current[i];
        if (!p) return;
        const x = s.x * w;
        const shift = (-(y * s.speed) % (h * 1.6)) + h * 0.3; // parallax, em ciclo
        const sway = Math.sin(t + s.phase) * 40;
        const b = bend * (0.6 + s.speed);
        const top = shift - h * 0.6;
        const bottom = shift + h * 1.4;
        p.setAttribute(
          "d",
          `M ${x + sway * 0.3} ${top}
           C ${x + s.curl + sway + b} ${top + (bottom - top) * 0.3},
             ${x - s.curl - sway - b} ${top + (bottom - top) * 0.62},
             ${x + sway * 0.5 + b * 0.4} ${bottom}`,
        );
        // desenha-se ao descer, recolhe ao subir
        const length = 1;
        const drawn = Math.min(1, 0.25 + progress * 1.2 + i * 0.04);
        p.style.strokeDasharray = `${length}`;
        p.style.strokeDashoffset = `${length * (1 - drawn)}`;
      });

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    if (reduced) window.addEventListener("scroll", draw, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", draw);
    };
  }, []);

  return (
    <svg ref={svg} className="pointer-events-none fixed inset-0 z-0 size-full text-accent" aria-hidden preserveAspectRatio="none">
      <defs>
        <linearGradient id="vein-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.25" stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.75" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {STRANDS.map((s, i) => (
        <path
          key={i}
          ref={(n) => {
            paths.current[i] = n;
          }}
          pathLength={1}
          fill="none"
          stroke="url(#vein-fade)"
          strokeWidth={s.width}
          strokeLinecap="round"
          opacity={s.opacity}
        />
      ))}
    </svg>
  );
}
