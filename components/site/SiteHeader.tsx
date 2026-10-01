"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/format";
import { openChat } from "@/lib/chat-store";

const NAV = [
  { href: "/#servicos", label: "Serviços" },
  { href: "/#trabalhos", label: "Trabalhos" },
  { href: "/#sobre", label: "Sobre" },
  { href: "/#opinioes", label: "Opiniões" },
  { href: "/#agenda", label: "Agenda" },
  { href: "/#contacto", label: "Contacto" },
];

export function SiteHeader({ phone }: { phone: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-500",
        scrolled || menu ? "border-b border-border bg-background/85 backdrop-blur-md" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-6 px-4 sm:px-8">
        <Link href="/" className="flex flex-col leading-none" onClick={() => setMenu(false)}>
          <span className="font-serif text-3xl tracking-wide">Brida</span>
          <span className="font-label text-[9px] tracking-[0.3em] whitespace-nowrap text-accent uppercase">Coiffeur · Claudia Rocha</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-8 md:flex" aria-label="Principal">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="font-label text-[11px] tracking-[0.25em] text-foreground/70 uppercase transition hover:text-accent"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <a
          href={`tel:${phone}`}
          className="ml-auto hidden items-center gap-2 text-sm text-foreground/70 transition hover:text-accent md:ml-0 lg:flex"
        >
          <Phone className="size-4" /> {formatPhone(phone).replace("+351 ", "")}
        </a>

        <button
          type="button"
          onClick={() => (document.getElementById("agenda") ? document.getElementById("agenda")!.scrollIntoView({ behavior: "smooth" }) : openChat())}
          className="ml-auto h-10 rounded-full bg-accent px-5 font-label text-[11px] tracking-[0.2em] text-accent-foreground uppercase transition hover:brightness-110 md:ml-0"
        >
          Marcar
        </button>

        <button
          type="button"
          className="-mr-2 p-2 md:hidden"
          aria-label={menu ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          {menu ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {menu && (
        <nav className="border-t border-border px-4 pt-2 pb-6 md:hidden" aria-label="Menu">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setMenu(false)}
              className="block border-b border-border py-4 font-serif text-2xl"
            >
              {n.label}
            </a>
          ))}
          <a href={`tel:${phone}`} className="mt-5 flex items-center gap-2 text-muted-foreground">
            <Phone className="size-4" /> Ligar para o salão
          </a>
        </nav>
      )}
    </header>
  );
}
