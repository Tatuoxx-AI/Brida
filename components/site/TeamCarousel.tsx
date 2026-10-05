"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { SiteStaff } from "@/lib/site-data";

// Secção "A nossa equipa" — carrossel em leque (coverflow) inspirado no "Team 02 Pixa":
// o retrato do centro em destaque e os outros a encolher simetricamente para os lados,
// com nome, cargo e redes a trocar por baixo. Adaptado ao visual preto/champanhe do site.

/** Tamanho (px), raio e camada por distância ao centro: 0, 1, 2, 3. */
const LADDER = {
  lg: [364, 264, 164, 64],
  md: [300, 210, 130, 56],
  sm: [230, 140, 84, 44],
};
const RADIUS = [40, 36, 28, 16];
const Z = [50, 40, 30, 20];
const SPRING = { type: "spring" as const, stiffness: 180, damping: 24, mass: 0.8 };

function useLadder() {
  const [ladder, setLadder] = useState(LADDER.lg);
  useEffect(() => {
    const pick = () => setLadder(window.innerWidth < 640 ? LADDER.sm : window.innerWidth < 1024 ? LADDER.md : LADDER.lg);
    pick();
    window.addEventListener("resize", pick);
    return () => window.removeEventListener("resize", pick);
  }, []);
  return ladder;
}

/** Aparece suavemente ao entrar no ecrã (uma vez). */
function AnimatedContent({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ícones de marcas desenhados à mão (o lucide-react v1 deixou de os incluir)
function Instagram({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function Facebook({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z" />
    </svg>
  );
}

function TikTok({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M14 3c.4 2.6 2.2 4.4 5 4.6" />
    </svg>
  );
}

export function TeamCarousel({
  members,
  eyebrow,
  title,
  accent,
  text,
}: {
  members: SiteStaff[];
  eyebrow: string;
  title: string;
  accent: string;
  text: string;
}) {
  const t = useT();
  const ladder = useLadder();
  const n = members.length;
  // começa no centro do grupo (no modelo, o 4.º de 7)
  const [active, setActive] = useState(Math.min(3, Math.max(0, Math.floor((n - 1) / 2))));
  const [hovered, setHovered] = useState(false);
  const swipe = useRef<number | null>(null);
  if (!n) return null;

  // com poucas pessoas mostra menos cartões, para nunca repetir a mesma pessoa
  const reach = Math.min(3, Math.floor((n - 1) / 2));
  const offsets = Array.from({ length: reach * 2 + 1 }, (_, i) => i - reach);
  const at = (i: number) => ((i % n) + n) % n;
  const go = (delta: number) => setActive((a) => at(a + delta));
  const current = members[at(active)];

  const socials = [
    { key: "instagram", href: current.socials.instagram, Icon: Instagram, label: "Instagram" },
    { key: "facebook", href: current.socials.facebook, Icon: Facebook, label: "Facebook" },
    { key: "tiktok", href: current.socials.tiktok, Icon: TikTok, label: "TikTok" },
  ].filter((s) => s.href);

  const arrow = (side: "left" | "right") => (
    <button
      type="button"
      onClick={() => go(side === "left" ? -1 : 1)}
      aria-label={side === "left" ? t.prevMember : t.nextMember}
      style={{ top: ladder[0] / 2 + 8 }}
      className={cn(
        "absolute z-[60] grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur transition-all duration-300 hover:border-accent hover:text-accent md:size-12",
        side === "left" ? "left-2 md:left-6" : "right-2 md:right-6",
        // no computador só aparecem com o rato por cima; no telemóvel ficam sempre visíveis
        hovered ? "md:translate-x-0 md:opacity-100" : cn("md:pointer-events-none md:opacity-0", side === "left" ? "md:-translate-x-3" : "md:translate-x-3"),
      )}
    >
      {side === "left" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );

  return (
    <section id="equipa" className="relative overflow-hidden py-20 md:py-32">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        {/* cabeçalho */}
        <div className="mb-14 flex flex-col items-center text-center md:mb-20">
          <AnimatedContent delay={0.1}>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5">
              <Users className="size-4 text-accent" />
              <span className="font-label text-[12px] tracking-[0.2em] text-accent uppercase">{eyebrow}</span>
            </span>
          </AnimatedContent>
          <AnimatedContent delay={0.2}>
            <h2 className="mb-6 max-w-2xl text-[40px] leading-[1.1] font-light md:text-[56px]">
              {title} <em className="text-accent">{accent}</em>
            </h2>
          </AnimatedContent>
          <AnimatedContent delay={0.3}>
            <p className="max-w-xl text-[17px] leading-[28px] text-muted-foreground">{text}</p>
          </AnimatedContent>
        </div>

        {/* carrossel */}
        <div className="flex flex-col items-center">
          <div
            className="relative mb-10 w-full"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onPointerDown={(e) => (swipe.current = e.clientX)}
            onPointerUp={(e) => {
              if (swipe.current === null) return;
              const dx = e.clientX - swipe.current;
              swipe.current = null;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            }}
          >
            <div className="flex w-full items-center justify-center" style={{ height: ladder[0] + 16 }}>
              <div className="flex w-full touch-pan-y items-center justify-center gap-4 md:gap-6">
                {offsets.map((off) => {
                  const m = members[at(active + off)];
                  const d = Math.abs(off);
                  return (
                    <motion.button
                      type="button"
                      key={m.id}
                      onClick={() => off !== 0 && go(off)}
                      aria-label={m.name}
                      aria-current={off === 0}
                      initial={false}
                      animate={{ width: ladder[d], height: ladder[d], borderRadius: RADIUS[d] }}
                      transition={SPRING}
                      style={{ zIndex: Z[d] }}
                      className={cn(
                        "relative shrink-0 overflow-hidden border border-border bg-card shadow-2xl",
                        off === 0 ? "cursor-default border-accent/40" : "cursor-pointer",
                      )}
                    >
                      {m.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element -- retratos do próprio site (/media)
                        <img src={m.avatar} alt={m.name} draggable={false} className="size-full object-cover" />
                      ) : (
                        <span className="grid size-full place-items-center bg-[radial-gradient(120%_120%_at_30%_20%,oklch(0.32_0.03_75),oklch(0.17_0.008_60))] font-serif text-accent italic">
                          <span style={{ fontSize: Math.max(16, ladder[d] * 0.32) }}>{m.name.charAt(0)}</span>
                        </span>
                      )}
                      {off !== 0 && <span className="absolute inset-0 bg-background/30 transition-colors duration-300 hover:bg-transparent" />}
                    </motion.button>
                  );
                })}
              </div>
            </div>
            {n > 1 && arrow("left")}
            {n > 1 && arrow("right")}
          </div>

          {/* detalhes de quem está ao centro */}
          <div className="flex h-[124px] flex-col items-center text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center"
              >
                <h3 className="mb-1 font-serif text-[28px] leading-[34px]">{current.name}</h3>
                {current.jobTitle && <p className="mb-5 text-[15px] leading-[24px] text-muted-foreground">{current.jobTitle}</p>}
                {socials.length > 0 && (
                  <div className="flex items-center gap-5">
                    {socials.map(({ key, href, Icon, label }) => (
                      <a
                        key={key}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${label} — ${current.name}`}
                        className="group p-1 text-muted-foreground transition-colors hover:text-accent"
                      >
                        <Icon className="size-5 transition-all" strokeWidth={1.5} />
                      </a>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
