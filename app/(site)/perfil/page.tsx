import type { Metadata } from "next";
import { currentClient } from "@/lib/client-session";
import { getLocale } from "@/lib/i18n/server";
import { UI } from "@/lib/i18n/ui";
import { LOCALE_INFO } from "@/lib/i18n/locales";
import { myAppointments } from "@/actions/client";
import { one } from "@/lib/db";
import { MyProfile } from "@/components/site/MyProfile";

export const metadata: Metadata = { title: "Perfil", robots: { index: false } };
export const dynamic = "force-dynamic";

// recompensa de origem já traduzida; a que a dona escrever é traduzida pela IA ao guardar
const DEFAULT_REWARD: Record<string, string> = {
  pt: "Uma hidratação grátis",
  en: "A free deep-conditioning treatment",
  fr: "Un soin hydratant offert",
  es: "Una hidratación gratis",
  de: "Eine gratis Feuchtigkeitspflege",
};
const rewardIn = (locale: string, reward: string, translated: string | null | undefined) =>
  locale === "pt" ? reward : reward === DEFAULT_REWARD.pt ? DEFAULT_REWARD[locale] : (translated ?? reward);

export default async function PerfilPage() {
  const [locale, me] = await Promise.all([getLocale(), currentClient()]);
  const t = UI[locale];
  const [appts, card] = await Promise.all([
    me ? myAppointments(locale) : Promise.resolve({ upcoming: [], past: [] }),
    one<{ loyalty_stamps_required: number; loyalty_reward: string; name: string; reward_i18n: string | null }>(
      `select loyalty_stamps_required, loyalty_reward, name, content_i18n -> $1 ->> 'loyaltyReward' as reward_i18n
         from public.salon_settings where id = 1`,
      [locale],
    ),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

  return (
    <main className="mx-auto max-w-3xl px-4 pt-32 pb-24 sm:px-8">
      <p className="flex items-center gap-3 font-label text-[11px] tracking-[0.35em] text-accent uppercase">
        <span className="h-px w-8 bg-accent/60" />
        {me ? t.me.title : t.me.createTitle}
      </p>
      <h1 className="mt-5 text-5xl font-light sm:text-6xl">{me ? me.name : t.me.createTitle}</h1>
      <p className="mt-3 text-muted-foreground">{t.me.intro}</p>
      <MyProfile
        me={me}
        upcoming={appts.upcoming}
        past={appts.past}
        card={{ required: card?.loyalty_stamps_required ?? 10, reward: rewardIn(locale, card?.loyalty_reward ?? "", card?.reward_i18n), brand: card?.name ?? "Brida Coiffeur" }}
        intl={LOCALE_INFO[locale].intl}
        today={today}
      />
    </main>
  );
}
