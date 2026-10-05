"use client";

import { motion } from "framer-motion";
import type { SiteBrand } from "@/lib/site-data";

// Faixa "Trabalhamos com as melhores marcas" — adaptação do "Trusted Brand Black": uma fila
// de logótipos a deslizar sem fim, com as pontas a desvanecer e pausa ao passar o rato.
// Em vez de brancos, os logótipos são "pintados" a dourado brilhante: o ficheiro serve de
// máscara (só conta a transparência) sobre um gradiente dourado.

const GOLD = "linear-gradient(180deg, #FFF4CC 0%, #F6CF57 40%, #D9A521 75%, #B07A12 100%)";
const HEIGHT = 32;

function Logo({ b, hidden }: { b: SiteBrand; hidden?: boolean }) {
  const width = Math.round((HEIGHT * b.w) / b.h);
  const mask = `url("${b.logo}") center / contain no-repeat`;
  return (
    <span
      role={hidden ? undefined : "img"}
      aria-label={hidden ? undefined : b.name}
      aria-hidden={hidden || undefined}
      title={b.name}
      className="block shrink-0 opacity-60 transition-opacity duration-300 hover:opacity-100"
      style={{ height: HEIGHT, width: Math.min(width, 200), background: GOLD, mask, WebkitMask: mask }}
    />
  );
}

export function BrandsMarquee({ brands, title }: { brands: SiteBrand[]; title: string }) {
  if (!brands.length) return null;
  // com poucas marcas repete a lista para encher a largura do ecrã antes de duplicar
  const base = Array.from({ length: Math.ceil(8 / brands.length) }, () => brands).flat();
  const track = [...base, ...base];

  return (
    <section id="marcas" className="relative w-full overflow-hidden bg-black py-20 select-none">
      <style>{`
        @keyframes brida-brands { from { transform: translateX(0); } to { transform: translateX(calc(-50% - 40px)); } }
        @keyframes brida-brands-m { from { transform: translateX(0); } to { transform: translateX(calc(-50% - 20px)); } }
        .brida-brands-track { animation: brida-brands 30s linear infinite; will-change: transform; }
        .brida-brands:hover .brida-brands-track { animation-play-state: paused; }
        @media (max-width: 768px) {
          .brida-brands-track { gap: 40px; animation: brida-brands-m 20s linear infinite; }
        }
        @media (prefers-reduced-motion: reduce) { .brida-brands-track { animation-duration: 90s; } }
      `}</style>
      <div className="relative z-10 mx-auto max-w-[1200px]">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-[60px] px-4 text-center font-label text-[13px] leading-[140%] tracking-[0.3em] text-accent uppercase"
        >
          {title}
        </motion.h2>
        <div className="brida-brands group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
          <div className="brida-brands-track flex min-w-full shrink-0 items-center gap-[80px]">
            {track.map((b, i) => (
              <Logo key={`${b.id}-${i}`} b={b} hidden={i >= brands.length} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
