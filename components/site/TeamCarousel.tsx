"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { SiteStaff } from "@/lib/site-data";

// Secção "A nossa equipa": uma fila de cartões com a foto de cada profissional (a que a
// dona carrega no painel), nome, cargo e redes. Cabem até 5 no computador e 2 no telemóvel;
// se houver mais, aparecem setas e dá para deslizar. Visual preto/champanhe do site.

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
function Instagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function Facebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z" />
    </svg>
  );
}

function TikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M14 3c.4 2.6 2.2 4.4 5 4.6" />
    </svg>
  );
}

function MemberCard({ m, index }: { m: SiteStaff; index: number }) {
  const socials = [
    { key: "instagram", href: m.socials.instagram, Icon: Instagram, label: "Instagram" },
    { key: "facebook", href: m.socials.facebook, Icon: Facebook, label: "Facebook" },
    { key: "tiktok", href: m.socials.tiktok, Icon: TikTok, label: "TikTok" },
  ].filter((s) => s.href);
  // se a foto falhar (apagada/sem rede) mostra a inicial; confere também o caso de falhar antes da hidratação
  const img = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setBroken(true);
  }, []);

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: Math.min(index, 5) * 0.08, ease: [0.25, 0.1, 0.25, 1] }}
      className="group w-[150px] shrink-0 snap-start text-center sm:w-[180px] lg:w-[208px]"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-[28px] border border-border bg-card shadow-2xl transition duration-500 group-hover:-translate-y-1.5 group-hover:border-accent/50">
        {m.avatar && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- retratos do próprio site (/media)
          <img
            ref={img}
            onError={() => setBroken(true)}
            src={m.avatar}
            alt={m.name}
            loading="lazy"
            draggable={false}
            className="size-full object-cover transition duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="grid size-full place-items-center bg-[radial-gradient(120%_120%_at_30%_20%,oklch(0.32_0.03_75),oklch(0.17_0.008_60))] font-serif text-6xl text-accent italic">
            {m.name.charAt(0)}
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
      </div>
      <h3 className="mt-4 truncate font-serif text-xl leading-tight sm:text-2xl">{m.name}</h3>
      {m.jobTitle && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground sm:text-sm">{m.jobTitle}</p>}
      {socials.length > 0 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          {socials.map(({ key, href, Icon, label }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${label} — ${m.name}`}
              className="p-1 text-muted-foreground transition-colors hover:text-accent"
            >
              <Icon className="size-[18px]" />
            </a>
          ))}
        </div>
      )}
    </motion.article>
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
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  // as setas só aparecem quando há mais profissionais do que cabem no ecrã
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, members.length]);

  if (!members.length) return null;
  const overflow = !(edges.start && edges.end);
  const go = (dir: -1 | 1) => {
    const el = track.current;
    const card = el?.querySelector("article");
    if (!el || !card) return;
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + 24), behavior: "smooth" });
    setTimeout(measure, 450); // nem todos os browsers avisam o fim do deslize suave
  };

  const arrow = (dir: -1 | 1) => (
    <button
      type="button"
      onClick={() => go(dir)}
      disabled={dir < 0 ? edges.start : edges.end}
      aria-label={dir < 0 ? t.prevMember : t.nextMember}
      className={cn(
        "absolute top-[38%] z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur transition hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-0 md:size-12",
        dir < 0 ? "left-0 md:-left-2" : "right-0 md:-right-2",
      )}
    >
      {dir < 0 ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );

  return (
    <section id="equipa" className="relative overflow-hidden py-20 md:py-32">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        {/* cabeçalho */}
        <div className="mb-12 flex flex-col items-center text-center md:mb-16">
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

        {/* fila de profissionais */}
        <div className="relative">
          <div
            ref={track}
            onScroll={measure}
            className="mx-auto flex w-fit max-w-full snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] sm:gap-6 [&::-webkit-scrollbar]:hidden"
          >
            {members.map((m, i) => (
              <MemberCard key={m.id} m={m} index={i} />
            ))}
          </div>
          {overflow && arrow(-1)}
          {overflow && arrow(1)}
        </div>
      </div>
    </section>
  );
}
