"use client";

import { motion, type Variants } from "framer-motion";
import { Sparkles } from "lucide-react";
import { SilkBackground } from "./SilkBackground";
import { cn } from "@/lib/utils";
import { openChat } from "@/lib/chat-store";

// Secção final "Brida Chat" — adaptação do hero "AI HR Manager": fundo de seda em vídeo,
// selo, título, dois botões. Recolorida em
// preto e dourado brilhante.

const GOLD = "linear-gradient(180deg, #FFF4CC 0%, #F6CF57 38%, #D9A521 72%, #B07A12 100%)";

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

export function ChatShowcase({
  assistantName,
  title,
  accent,
  text,
  ctaChat,
  ctaAgenda,
  className,
}: {
  assistantName: string;
  title: string;
  accent: string;
  text: string;
  ctaChat: string;
  ctaAgenda: string;
  className?: string;
}) {
  return (
    <section className={cn("relative flex min-h-[80vh] w-full flex-col items-center justify-center overflow-hidden bg-black py-24", className)}>
      <SilkBackground>
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0, 0, 0, 0.00) 0%, #000 100%)" }} />
        <div className="absolute inset-0 bg-black/20" />
      </SilkBackground>
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
        <motion.div variants={itemVariants} className="flex flex-col gap-4 sm:flex-row">
          <HeroButton primary onClick={() => openChat()}>
            {ctaChat}
          </HeroButton>
          <HeroButton href="/#agenda">{ctaAgenda}</HeroButton>
        </motion.div>
      </motion.div>
    </section>
  );
}
