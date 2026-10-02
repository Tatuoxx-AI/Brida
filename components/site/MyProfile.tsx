"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { cancelMyAppointment, createMyProfile, forgetThisDevice, requestMyReward, updateMyProfile, type MyAppointment } from "@/actions/client";
import { LoyaltyCard } from "@/components/shared/LoyaltyCard";
import type { ClientMe } from "@/lib/client-session";

const input =
  "h-12 w-full rounded-xl border border-border bg-background/60 px-4 text-sm outline-none transition focus:border-accent/60";

export function MyProfile({
  me,
  upcoming,
  past,
  card,
  intl,
  today,
}: {
  me: ClientMe | null;
  upcoming: MyAppointment[];
  past: MyAppointment[];
  card: { required: number; reward: string; brand: string };
  intl: string;
  today: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [f, setF] = useState({ name: me?.name ?? "", phone: me?.phone ?? "", email: me?.email ?? "", birthDate: me?.birthDate ?? "" });
  const errorText = (code: string) =>
    code === "EXISTS" ? t.me.exists : code === "TOO_LATE" ? t.me.tooLate : (t.errors[code] ?? t.errors.generic);
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }).format(
      new Date(iso),
    );

  function run(fn: () => Promise<{ ok: true } | { ok: false; code: string }>, okText: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { text: okText, ok: true } : { text: errorText(r.code), ok: false });
      if (r.ok) router.refresh();
    });
  }

  const fields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <input className={input} required autoComplete="name" placeholder={t.agenda.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input
        className={cn(input, me && "opacity-60")}
        required
        type="tel"
        autoComplete="tel"
        placeholder={t.agenda.phone}
        value={f.phone}
        disabled={!!me}
        onChange={(e) => setF({ ...f, phone: e.target.value })}
      />
      <input className={input} required type="email" autoComplete="email" placeholder={t.agenda.email} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <label className="relative block">
        <span className="pointer-events-none absolute top-1.5 left-4 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">{t.agenda.birthday}</span>
        <input
          className={cn(input, "pt-4 [color-scheme:dark]")}
          required
          type="date"
          autoComplete="bday"
          max={today}
          aria-label={t.agenda.birthday}
          value={f.birthDate}
          onChange={(e) => setF({ ...f, birthDate: e.target.value })}
        />
      </label>
    </div>
  );

  const status = msg && <p className={cn("text-sm", msg.ok ? "text-emerald-300" : "text-amber-300")}>{msg.text}</p>;

  if (!me) {
    return (
      <form
        className="mt-10 space-y-4 rounded-3xl border border-border bg-card/70 p-6 backdrop-blur sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createMyProfile(f), t.me.saved);
        }}
      >
        {fields}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7 font-label text-xs tracking-[0.2em] text-accent-foreground uppercase transition hover:brightness-110 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />} {t.me.create}
          </button>
          {status}
        </div>
      </form>
    );
  }

  const canRedeem = me.stamps >= card.required;
  return (
    <div className="mt-10 space-y-10">
      {/* próximas */}
      <section>
        <h2 className="font-serif text-3xl">{t.me.upcoming}</h2>
        {upcoming.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-border bg-card/60 p-6 text-muted-foreground">
            {t.me.none}{" "}
            <a href="/#agenda" className="text-accent hover:underline">
              {t.me.bookNow}
            </a>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {upcoming.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-card/70 p-5">
                <CalendarCheck className="size-5 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.services}</p>
                  <p className="text-sm text-muted-foreground first-letter:uppercase">
                    {fmt(a.start)} · {t.booking.with} {a.staff}
                  </p>
                </div>
                <span className={cn("rounded-full border px-2.5 py-0.5 text-xs", a.status === "confirmed" ? "border-emerald-400/50 text-emerald-300" : "border-amber-400/50 text-amber-300")}>
                  {t.me.status[a.status] ?? a.status}
                </span>
                {a.canCancel && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => confirm(t.me.cancelConfirm) && run(() => cancelMyAppointment(a.id), t.me.cancelled)}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                  >
                    {t.me.cancel}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* cartão */}
      <section>
        <h2 className="font-serif text-3xl">{t.me.card}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.me.cardTip}</p>
        <div className="mt-6">
          <LoyaltyCard
            name={me.name}
            stamps={Math.min(me.stamps, card.required)}
            required={card.required}
            reward={card.reward}
            brand={card.brand}
            labels={{ client: t.me.client, stamps: t.me.stamps, equals: t.me.equals, flip: t.me.flip, rules: t.me.rules }}
          />
        </div>
        {canRedeem && (
          <div className="mt-5 text-center">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(requestMyReward, t.me.redeemSent)}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7 font-label text-xs tracking-[0.2em] text-accent-foreground uppercase transition hover:brightness-110"
            >
              {t.me.redeem}
            </button>
          </div>
        )}
      </section>

      {/* dados */}
      <section>
        <h2 className="font-serif text-3xl">{t.me.title}</h2>
        <form
          className="mt-4 space-y-4 rounded-3xl border border-border bg-card/70 p-6 backdrop-blur sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateMyProfile({ name: f.name, email: f.email, birthDate: f.birthDate }), t.me.saved);
          }}
        >
          {fields}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-accent/50 px-6 text-xs tracking-[0.15em] text-accent uppercase transition hover:bg-accent/10"
            >
              {pending && <Loader2 className="size-4 animate-spin" />} {t.me.save}
            </button>
            {status}
          </div>
        </form>
      </section>

      {/* histórico */}
      {past.length > 0 && (
        <section>
          <h2 className="font-serif text-3xl">{t.me.history}</h2>
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card/60">
            {past.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3 px-5 py-3 text-sm">
                <span className="text-muted-foreground first-letter:uppercase">{fmt(a.start)}</span>
                <span className="flex-1">{a.services}</span>
                <span className="text-muted-foreground">{t.me.status[a.status] ?? a.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={() => confirm(t.me.signOutConfirm) && run(forgetThisDevice, "✓")}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-3.5" /> {t.me.signOut}
      </button>
    </div>
  );
}
