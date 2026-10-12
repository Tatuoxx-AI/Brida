import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Gift, UserPlus } from "lucide-react";
import { inviterByCode } from "@/lib/invite";
import { getLocale } from "@/lib/i18n/server";
import { UI } from "@/lib/i18n/ui";
import { one } from "@/lib/db";

// Página para onde o QR do convite aponta. Só diz quem convidou e abre o
// caminho para marcar — nada do perfil de quem convidou aparece aqui, só o
// primeiro nome.

export const metadata: Metadata = { title: "Convite", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConvitePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const [locale, inviter] = await Promise.all([getLocale(), inviterByCode(codigo)]);
  if (!inviter) notFound();

  // O código já ficou guardado no aparelho pelo middleware (ver middleware.ts).

  const t = UI[locale].invite;
  const s = await one<{ invite_discount_step: number; invite_discount_max: number }>(
    `select invite_discount_step, invite_discount_max from public.salon_settings where id = 1`,
  );
  const passo = Number(s?.invite_discount_step ?? 5);
  const teto = Number(s?.invite_discount_max ?? 50);

  return (
    <main className="mx-auto max-w-2xl px-4 pt-32 pb-24 sm:px-8">
      <p className="flex items-center gap-3 font-label text-[11px] tracking-[0.35em] text-accent uppercase">
        <span className="h-px w-8 bg-accent/60" />
        {t.badge}
      </p>

      <h1 className="mt-5 text-5xl leading-tight font-light sm:text-6xl">{t.welcome(inviter.firstName)}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{t.intro(inviter.firstName)}</p>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Link
          href="/#agenda"
          className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-7 text-sm font-medium text-black transition hover:brightness-110"
        >
          <CalendarCheck className="size-4" /> {t.book}
        </Link>
        <Link
          href="/perfil"
          className="flex min-h-14 items-center justify-center gap-2 rounded-full border border-accent/40 px-7 text-sm transition hover:border-accent"
        >
          <UserPlus className="size-4" /> {t.createProfile}
        </Link>
      </div>

      <div className="mt-12 rounded-3xl border border-border bg-card/70 p-6 backdrop-blur sm:p-8">
        <p className="flex items-center gap-2 font-label text-[11px] tracking-[0.2em] text-accent uppercase">
          <Gift className="size-4" /> {t.howTitle}
        </p>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li>
            <span className="mr-2 text-accent">1.</span>
            {t.step1}
          </li>
          <li>
            <span className="mr-2 text-accent">2.</span>
            {t.step2}
          </li>
          <li>
            <span className="mr-2 text-accent">3.</span>
            {t.step3(inviter.firstName, passo, teto)}
          </li>
        </ol>
        <p className="mt-5 text-xs text-muted-foreground/70">{t.privacy}</p>
      </div>
    </main>
  );
}
