"use client";

import { useEffect, useRef } from "react";
import { motion, type Variants } from "framer-motion";
import { Maximize, Play, Settings, Sparkles, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { openChat } from "@/lib/chat-store";

// Secção final "Brida Chat" — adaptação do hero "AI HR Manager": fundo de seda em vídeo,
// selo, título, dois botões e um cartão com moldura de leitor de vídeo. Recolorida em
// preto e dourado brilhante; o "play" abre a Brida Chat.

const GOLD = "linear-gradient(180deg, #FFF4CC 0%, #F6CF57 38%, #D9A521 72%, #B07A12 100%)";
const SILK = "https://cdn.jiro.build/Tanvir/bg/silk-1770305242948%20(1).mp4";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.2, delayChildren: 0.3 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 50, damping: 20 } },
};
const buttonVariants = (primary: boolean): Variants => ({
  hover: { y: -2, scale: 1.02, filter: primary ? "brightness(1.08)" : "brightness(1.15)", transition: { type: "spring", stiffness: 300, damping: 15 } },
  tap: { scale: 0.98 },
});

/** Seda em vídeo, tingida de dourado; só descarrega/toca quando a secção está perto do ecrã. */
function BackgroundVideo() {
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
    <div className="pointer-events-none absolute inset-0 z-0 size-full">
      <video
        ref={ref}
        loop
        muted
        playsInline
        preload="none"
        aria-hidden
        className="absolute inset-0 size-full object-cover opacity-80"
        style={{ filter: "grayscale(1) sepia(1) saturate(3.2) hue-rotate(-6deg) brightness(0.85) contrast(1.15)" }}
      />
      {/* brilho dourado suave por trás do título (também serve de fundo enquanto o vídeo carrega) */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 45% at 50% 25%, rgba(246, 207, 87, 0.16) 0%, rgba(0, 0, 0, 0) 70%)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0, 0, 0, 0.00) 0%, #000 100%)" }} />
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-[10px]"
        style={{
          border: "1px solid rgba(246, 207, 87, 0.22)",
          background: "rgba(246, 207, 87, 0.06)",
          boxShadow: "0 12px 12px 1px rgba(246, 207, 87, 0.22) inset, 0 1px 0 1px rgba(255, 236, 170, 0.4) inset",
        }}
      >
        <Sparkles size={20} className="text-[#F6CF57]" />
      </div>
      <span className="text-center font-label text-[13px] leading-[21px] tracking-[0.25em] text-[#F6CF57] uppercase">{label}</span>
    </div>
  );
}

function HeroButton({ primary, children, onClick, href }: { primary?: boolean; children: React.ReactNode; onClick?: () => void; href?: string }) {
  const style: React.CSSProperties = primary
    ? {
        background: GOLD,
        boxShadow:
          "0 10px 16px -10px rgba(255, 255, 255, 0.3) inset, 0 8px 24px 0 rgba(246, 207, 87, 0.22), 0 4px 4px 0 rgba(0, 0, 0, 0.3), 0 0 1px 0 rgba(0, 0, 0, 0.5), 0 -2px 1px 0 rgba(120, 70, 0, 0.35) inset, 0 1px 1px 0 rgba(255, 250, 220, 0.6) inset",
      }
    : {
        background: "#0B0A08",
        border: "1px solid rgba(246, 207, 87, 0.55)",
        boxShadow: "0 4px 4px 0 rgba(0, 0, 0, 0.3), 0 0 18px 0 rgba(246, 207, 87, 0.12), 0 1px 1px 0 rgba(255, 236, 170, 0.12) inset",
      };
  const cls = "flex cursor-pointer select-none items-center justify-center gap-[10px] rounded-[14px] px-9 py-4";
  const label = (
    <span className={cn("font-label text-[13px] leading-6 tracking-[0.18em] uppercase", primary ? "text-black" : "text-[#F6CF57]")}>{children}</span>
  );
  const v = buttonVariants(!!primary);
  return href ? (
    <motion.a href={href} className={cls} style={style} variants={v} whileHover="hover" whileTap="tap">
      {label}
    </motion.a>
  ) : (
    <motion.button type="button" onClick={onClick} className={cls} style={style} variants={v} whileHover="hover" whileTap="tap">
      {label}
    </motion.button>
  );
}

function VideoCard({ image, alt, label }: { image: string; alt: string; label: string }) {
  return (
    <motion.div
      className="relative flex items-center justify-center overflow-hidden rounded-[22px] shadow-2xl"
      style={{ width: "min(100%, 763px)", aspectRatio: "763 / 436", padding: 7, background: GOLD }}
      whileHover={{ y: -10, boxShadow: "0 25px 60px -12px rgba(246, 207, 87, 0.35)" }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <button
        type="button"
        onClick={() => openChat()}
        aria-label={label}
        className="group relative grid size-full cursor-pointer place-items-center overflow-hidden rounded-[18px] bg-black"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- foto do próprio site */}
        <img src={image} alt={alt} className="absolute inset-0 size-full object-cover opacity-80 transition duration-700 group-hover:scale-[1.03]" />
        <span className="absolute inset-0 bg-[#B07A12]/15 mix-blend-overlay" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

        {/* botão central: retângulo de cantos vivos, como no modelo */}
        <motion.span
          className="relative z-10 flex items-center justify-center shadow-lg"
          style={{ width: 125, height: 80, borderRadius: 0, background: GOLD }}
          initial={{ scale: 0.8, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, type: "spring" }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Play size={32} fill="black" strokeWidth={0} className="ml-2 text-black" />
        </motion.span>

        {/* barra do leitor */}
        <span
          className="absolute bottom-[14px] left-1/2 flex -translate-x-1/2 items-center justify-between gap-3 px-4"
          style={{ width: "calc(100% - 28px)", height: 34, maxWidth: 749, background: "rgba(0, 0, 0, 0.85)", borderRadius: 8 }}
        >
          <span className="flex min-w-0 flex-1 items-center gap-4 text-[#F6CF57]">
            <Play size={14} fill="currentColor" className="shrink-0" />
            <span className="shrink-0 font-label text-[10px] tracking-[0.2em] uppercase">{label}</span>
            <span className="relative h-[3px] w-full max-w-[400px] rounded-full bg-[#F6CF57]/20">
              <span className="absolute top-0 left-0 h-full w-1/3 rounded-full" style={{ background: GOLD }} />
              <span className="absolute top-1/2 left-1/3 size-2 -translate-y-1/2 rounded-full bg-[#FFF4CC]" />
            </span>
          </span>
          <span className="hidden items-center gap-3 text-[#F6CF57]/90 sm:flex">
            <Volume2 size={14} />
            <Settings size={14} />
            <Maximize size={14} />
          </span>
        </span>
      </button>
    </motion.div>
  );
}

export function ChatShowcase({
  assistantName,
  title,
  accent,
  text,
  ctaChat,
  ctaAgenda,
  image,
  className,
}: {
  assistantName: string;
  title: string;
  accent: string;
  text: string;
  ctaChat: string;
  ctaAgenda: string;
  image: string;
  className?: string;
}) {
  return (
    <section className={cn("relative flex min-h-screen w-full flex-col items-center justify-start overflow-hidden bg-black pt-20 pb-20", className)}>
      <BackgroundVideo />
      <motion.div
        className="relative z-10 flex w-full flex-col items-center px-4 md:px-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-120px" }}
      >
        <motion.div variants={itemVariants} className="mb-8">
          <Badge label={assistantName} />
        </motion.div>
        <motion.h2
          variants={itemVariants}
          className="mb-6 w-full max-w-[833px] text-center text-[44px] leading-[1.05] font-light text-white md:text-[76px] md:leading-[1]"
        >
          {title}{" "}
          <em className="bg-clip-text text-transparent" style={{ backgroundImage: GOLD }}>
            {accent}
          </em>
        </motion.h2>
        <motion.p variants={itemVariants} className="mb-10 w-full max-w-[595px] text-center text-lg leading-[1.5] text-white/80 md:text-[20px]">
          {text}
        </motion.p>
        <motion.div variants={itemVariants} className="mb-16 flex flex-col gap-4 sm:flex-row md:mb-20">
          <HeroButton primary onClick={() => openChat()}>
            {ctaChat}
          </HeroButton>
          <HeroButton href="/#agenda">{ctaAgenda}</HeroButton>
        </motion.div>
        <motion.div variants={itemVariants} className="flex w-full justify-center" style={{ perspective: "1000px" }}>
          <VideoCard image={image} alt={assistantName} label={assistantName} />
        </motion.div>
      </motion.div>
    </section>
  );
}
