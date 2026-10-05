"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, Phone, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/format";
import { openChat } from "@/lib/chat-store";
import { useLocale, useT } from "@/lib/i18n/client";
import { LOCALE_INFO } from "@/lib/i18n/locales";
import { openLanguagePicker } from "./LanguageGate";

export function SiteHeader({ phone, brandName, brandSub }: { phone: string; brandName: string; brandSub: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const t = useT();
  const locale = useLocale();
  const NAV = [
    { href: "/#servicos", label: t.nav.services },
    { href: "/#trabalhos", label: t.nav.work },
    { href: "/#sobre", label: t.nav.about },
    { href: "/#equipa", label: t.nav.team },
    { href: "/#opinioes", label: t.nav.reviews },
    { href: "/#agenda", label: t.nav.agenda },
    { href: "/#contacto", label: t.nav.contact },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const langButton = (
    <button
      type="button"
      onClick={openLanguagePicker}
      aria-label={`${t.language}: ${LOCALE_INFO[locale].name}`}
      title={t.language}
      className="flex h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs tracking-[0.15em] uppercase transition hover:border-accent/60"
    >
      <span className="text-base leading-none" aria-hidden>
        {LOCALE_INFO[locale].flag}
      </span>
      {locale}
    </button>
  );

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-500",
        scrolled || menu ? "border-b border-border bg-background/85 backdrop-blur-md" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-3 px-4 sm:px-8 lg:gap-6">
        <Link href="/" className="flex flex-col leading-none" onClick={() => setMenu(false)}>
          <span className="font-serif text-3xl tracking-wide">{brandName}</span>
          <span className="font-label text-[9px] tracking-[0.3em] whitespace-nowrap text-accent uppercase">{brandSub}</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-6 lg:flex xl:gap-8" aria-label="Principal">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="font-label text-[11px] tracking-[0.25em] text-foreground/70 uppercase transition hover:text-accent">
              {n.label}
            </a>
          ))}
        </nav>

        <a href={`tel:${phone}`} className="hidden items-center gap-2 text-sm text-foreground/70 transition hover:text-accent xl:flex">
          <Phone className="size-4" /> {formatPhone(phone).replace("+351 ", "")}
        </a>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <span className="hidden sm:block">{langButton}</span>
          <Link
            href="/perfil"
            aria-label={t.profile}
            title={t.profile}
            className="hidden size-10 place-items-center rounded-full border border-border transition hover:border-accent/60 sm:grid"
          >
            <UserRound className="size-4" />
          </Link>
          <button
            type="button"
            onClick={() => (document.getElementById("agenda") ? document.getElementById("agenda")!.scrollIntoView({ behavior: "smooth" }) : openChat())}
            className="h-10 rounded-full bg-accent px-5 font-label text-[11px] tracking-[0.2em] text-accent-foreground uppercase transition hover:brightness-110"
          >
            {t.book}
          </button>
          <button
            type="button"
            className="-mr-2 p-2 lg:hidden"
            aria-label={menu ? t.closeMenu : t.openMenu}
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            {menu ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {menu && (
        <nav className="border-t border-border px-4 pt-2 pb-6 lg:hidden" aria-label="Menu">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="block border-b border-border py-4 font-serif text-2xl">
              {n.label}
            </a>
          ))}
          <Link href="/perfil" onClick={() => setMenu(false)} className="flex items-center gap-2 border-b border-border py-4 font-serif text-2xl">
            <UserRound className="size-5 text-accent" /> {t.profile}
          </Link>
          <div className="mt-5 flex items-center justify-between gap-3">
            <a href={`tel:${phone}`} className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" /> {t.callSalon}
            </a>
            {langButton}
          </div>
        </nav>
      )}
    </header>
  );
}
