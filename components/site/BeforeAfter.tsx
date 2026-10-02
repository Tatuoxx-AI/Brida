"use client";

import { useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";
import { Photo } from "./Photo";
import { useT } from "@/lib/i18n/client";

/** Comparador antes/depois: arrastar (rato ou dedo) ou usar as setas do teclado. */
export function BeforeAfter({ before, after, title }: { before: string; after: string; title: string }) {
  const t = useT();
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <figure className="group">
      <div
        ref={box}
        className="relative aspect-[4/5] cursor-ew-resize touch-pan-y overflow-hidden rounded-2xl border border-border select-none"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && move(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <Photo src={after} alt={`${title} — ${t.after}`} label={t.after} compact="right" className="absolute inset-0 size-full" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <Photo src={before} alt={`${title} — ${t.before}`} label={t.before} compact="left" className="absolute inset-0 size-full" />
        </div>

        <span className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 font-label text-[10px] tracking-[0.2em] text-white uppercase backdrop-blur">
          {t.before}
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-black/55 px-2.5 py-1 font-label text-[10px] tracking-[0.2em] text-white uppercase backdrop-blur">
          {t.after}
        </span>

        <div className="pointer-events-none absolute inset-y-0 w-px bg-accent" style={{ left: `${pos}%` }}>
          <div className="absolute top-1/2 left-1/2 grid size-10 -translate-1/2 place-items-center rounded-full border border-accent bg-background/80 text-accent shadow-lg backdrop-blur">
            <MoveHorizontal className="size-4" />
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`${t.compare}: ${title}`}
          className="sr-only"
        />
      </div>
      <figcaption className="mt-3 font-label text-xs tracking-[0.25em] text-muted-foreground uppercase">{title}</figcaption>
    </figure>
  );
}
