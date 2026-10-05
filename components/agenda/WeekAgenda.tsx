"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CalendarCheck, Loader2, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SiteServiceGroup, SiteStaff } from "@/lib/site-data";
import type { BookingSummary } from "@/lib/booking";
import { bookFromAgenda, getWeekSlots, type AgendaDay, type AgendaSlot } from "@/actions/agenda";
import { useT } from "@/lib/i18n/client";
import type { UiDict } from "@/lib/i18n/ui";

const REFRESH_MS = 60_000;
const HORIZON_DAYS = 60;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const durationLabel = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
};

/** 5 dias no computador, 3 no telemóvel. */
function useDayCount() {
  const [n, setN] = useState(5);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setN(mq.matches ? 3 : 5);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return n;
}

/** Retrato redondo da profissional (foto ou inicial). */
function Avatar({ p, size = 36 }: { p: Pick<SiteStaff, "name" | "avatar">; size?: number }) {
  return p.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element -- retratos do próprio site (/media)
    <img src={p.avatar} alt="" width={size} height={size} className="shrink-0 rounded-full border border-accent/40 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 font-serif text-accent italic"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {p.name.charAt(0)}
    </span>
  );
}

export function WeekAgenda({
  groups,
  staff,
  hoursRange,
  today,
  me: meInitial,
}: {
  groups: SiteServiceGroup[];
  staff: SiteStaff[];
  hoursRange: { open: number; close: number };
  today: string;
  /** perfil guardado neste aparelho (marca sem pedir os dados outra vez) */
  me: { name: string; phone: string | null } | null;
}) {
  const t = useT();
  const WEEKDAY = t.daysShort;
  const [me, setMe] = useState(meInitial);
  const [saved, setSaved] = useState<"saved" | "exists" | null>(null);
  const mains = useMemo(() => groups.flatMap((g) => g.items.filter((s) => !s.addon).map((s) => ({ ...s, group: g.key }))), [groups]);
  const [mainId, setMainId] = useState(mains[0]?.id ?? "");
  const main = mains.find((s) => s.id === mainId);
  const addons = useMemo(() => groups.find((g) => g.key === main?.group)?.items.filter((s) => s.addon) ?? [], [groups, main]);
  const [extras, setExtras] = useState<string[]>([]);
  const ids = useMemo(() => [mainId, ...extras.filter((e) => addons.some((a) => a.id === e))].filter(Boolean), [mainId, extras, addons]);
  const totalMinutes = [main, ...addons.filter((a) => extras.includes(a.id))].reduce((t, s) => t + (s?.duration ?? 0), 0);

  const staffForService = staff.filter((p) => !mainId || p.serviceIds.includes(mainId));
  const [staffId, setStaffId] = useState<string | null>(null);
  const staffName = staff.find((p) => p.id === staffId)?.name;
  // com "qualquer profissional", a cliente pode escolher entre quem está livre na hora escolhida
  const [slotStaff, setSlotStaff] = useState<string | null>(null);

  const dayCount = useDayCount();
  const [start, setStart] = useState(today);
  const [days, setDays] = useState<AgendaDay[]>([]);
  const [loading, startLoading] = useTransition();
  const [failed, setFailed] = useState(false);
  const req = useRef(0);

  const [cell, setCell] = useState<{ date: string; hour: number } | null>(null);
  const [slot, setSlot] = useState<AgendaSlot | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", birthDate: "", notes: "", website: "" });
  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const idsKey = ids.join(",");
  const load = useCallback(
    (silent = false) => {
      if (!ids.length) return;
      const r = ++req.current;
      if (!silent) setFailed(false);
      startLoading(async () => {
        try {
          const res = await getWeekSlots(start, dayCount, ids, staffId);
          if (r === req.current) setDays(res);
        } catch {
          if (r === req.current && !silent) setFailed(true);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey representa ids
    [start, dayCount, idsKey, staffId],
  );

  useEffect(() => load(), [load]);

  // "Sincronizado · atualiza sozinho": refresca de minuto a minuto e ao voltar ao separador
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && load(true), REFRESH_MS);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // ao mudar serviço/profissional/semana a escolha anterior deixa de valer
  useEffect(() => {
    setCell(null);
    setSlot(null);
  }, [idsKey, staffId, start]);

  const hours = Array.from({ length: Math.max(1, hoursRange.close - hoursRange.open) }, (_, i) => hoursRange.open + i);
  const slotsAt = (d: AgendaDay | undefined, h: number) => d?.slots.filter((s) => Number(s.time.slice(0, 2)) === h) ?? [];
  const lastDay = addDays(today, HORIZON_DAYS);
  const canPrev = start > today;
  const canNext = addDays(start, dayCount) <= lastDay;
  const cellSlots = cell ? slotsAt(days.find((d) => d.date === cell.date), cell.hour) : [];

  function choose(date: string, hour: number, list: AgendaSlot[]) {
    setCell({ date, hour });
    setSlot(list[0] ?? null);
    setError(null);
    setBooking(null);
    setTimeout(() => sheet.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return;
    setError(null);
    startSubmit(async () => {
      const res = await bookFromAgenda({
        serviceIds: ids,
        staffId: staffId ?? slotStaff,
        start: slot.start,
        ...(me ? { notes: form.notes || undefined } : { ...form, notes: form.notes || undefined }),
      });
      if (res.ok) {
        setBooking(res.booking);
        setCell(null);
        load(true);
        if (!me && res.profileSaved) {
          setMe({ name: form.name, phone: form.phone });
          setSaved("saved");
        } else setSaved(res.profileExists ? "exists" : null);
      } else {
        setError(t.errors[res.code] ?? res.error ?? t.errors.generic);
        if (res.code === "SLOT_UNAVAILABLE") {
          setSlot(null);
          load(true);
        }
      }
    });
  }

  return (
    <div className="flex h-full flex-col rounded-[1.75rem] border border-border bg-card/70 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 font-serif text-2xl">
          <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/60" /> {t.agenda.title}
        </p>
        <p className="font-label text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          {staffName ?? t.agenda.anyStaff} · {t.agenda.approx} {durationLabel(totalMinutes || 60)}
        </p>
      </div>

      {/* profissionais */}
      <p className="mt-5 font-label text-[10px] tracking-[0.25em] text-muted-foreground uppercase">{t.agenda.whoTitle}</p>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={t.agenda.whoTitle}>
        {[{ id: null, name: t.agenda.anyStaff, avatar: null, jobTitle: "" }, ...staffForService].map((p) => (
          <button
            key={p.id ?? "any"}
            type="button"
            role="radio"
            aria-checked={staffId === p.id}
            onClick={() => {
              setStaffId(p.id);
              setSlotStaff(null);
            }}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-full border py-1.5 pr-4 pl-1.5 text-left text-sm transition",
              staffId === p.id
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground",
            )}
          >
            {p.id ? (
              <Avatar p={p} size={32} />
            ) : (
              <span className="grid size-8 place-items-center rounded-full border border-current/30">
                <User className="size-3.5" />
              </span>
            )}
            <span className="flex flex-col leading-tight">
              <span>{p.name}</span>
              {p.jobTitle && <span className={cn("text-[11px]", staffId === p.id ? "opacity-75" : "text-muted-foreground")}>{p.jobTitle}</span>}
            </span>
          </button>
        ))}
      </div>

      {/* semana + serviço */}
      <div className="mt-5 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setStart(addDays(start, -dayCount) < today ? today : addDays(start, -dayCount))}
          disabled={!canPrev}
          className="flex h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm transition hover:border-accent/50 disabled:opacity-30 sm:px-4"
        >
          <ArrowLeft className="size-4" /> <span className="hidden sm:inline">{t.agenda.prev}</span>
        </button>
        <select
          value={mainId}
          onChange={(e) => {
            setMainId(e.target.value);
            setExtras([]);
            if (staffId && !staff.find((p) => p.id === staffId)?.serviceIds.includes(e.target.value)) setStaffId(null);
          }}
          aria-label={t.nav.services}
          className="h-11 w-full min-w-0 cursor-pointer rounded-full border border-border bg-background/60 px-4 text-center text-sm outline-none transition focus:border-accent/60"
        >
          {groups.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {g.items
                .filter((s) => !s.addon)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.duration ? ` — ${durationLabel(s.duration)}` : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setStart(addDays(start, dayCount))}
          disabled={!canNext}
          className="flex h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm transition hover:border-accent/50 disabled:opacity-30 sm:px-4"
        >
          <span className="hidden sm:inline">{t.agenda.next}</span> <ArrowRight className="size-4" />
        </button>
      </div>

      {addons.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {addons.map((a) => {
            const on = extras.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => setExtras((x) => (on ? x.filter((i) => i !== a.id) : [...x, a.id]))}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  on ? "border-accent/70 bg-accent/15 text-accent" : "border-dashed border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {on ? "✓" : "+"} {a.name}
              </button>
            );
          })}
        </div>
      )}

      {/* grelha */}
      <div className={cn("mt-6 transition-opacity", loading && "opacity-60")}>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `3.25rem repeat(${dayCount}, minmax(0, 1fr))` }}>
          <span />
          {Array.from({ length: dayCount }, (_, i) => {
            const date = addDays(start, i);
            const isToday = date === today;
            return (
              <div key={date} className="pb-1 text-center leading-tight">
                <p className={cn("font-label text-[10px] tracking-[0.2em] uppercase", isToday ? "text-accent" : "text-muted-foreground")}>
                  {isToday ? t.agenda.today : WEEKDAY[dow(date)]}
                </p>
                <p className="font-serif text-lg">{ddmm(date)}</p>
              </div>
            );
          })}

          {hours.map((h) => (
            <div key={h} className="contents">
              <span className="pt-3 pr-1 text-right text-xs text-muted-foreground tabular-nums">{String(h).padStart(2, "0")}:00</span>
              {Array.from({ length: dayCount }, (_, i) => {
                const date = addDays(start, i);
                const day = days.find((d) => d.date === date);
                const list = slotsAt(day, h);
                const free = list.length > 0;
                const selected = cell?.date === date && cell.hour === h;
                const discount = Math.max(0, ...list.map((s) => s.discount));
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={!free}
                    onClick={() => choose(date, h, list)}
                    aria-label={`${WEEKDAY[dow(date)]} ${ddmm(date)} ${h}h — ${free ? t.agenda.free(list.length) : t.agenda.unavailable}`}
                    className={cn(
                      "group relative h-12 rounded-xl border transition sm:h-14",
                      free
                        ? "border-accent/45 bg-accent/[0.04] hover:border-accent hover:bg-accent/15"
                        : "cursor-not-allowed border-border/40 bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgb(255_255_255/0.035)_7px_9px)]",
                      selected && "border-accent bg-accent text-accent-foreground hover:bg-accent",
                    )}
                  >
                    {free && (
                      <span className={cn("text-[11px] tabular-nums", selected ? "text-accent-foreground" : "text-accent/80 group-hover:text-accent")}>
                        {list[0].time}
                      </span>
                    )}
                    {discount > 0 && (
                      <span className="absolute -top-1.5 -right-1 rounded-full bg-accent px-1.5 text-[9px] font-semibold text-accent-foreground">
                        -{discount}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {failed && <p className="mt-4 text-sm text-destructive">{t.agenda.loadError}</p>}
      </div>

      {/* escolha da hora + dados */}
      {cell && cellSlots.length > 0 && (
        <div ref={sheet} className="mt-6 rounded-2xl border border-accent/40 bg-background/50 p-5 animate-in fade-in slide-in-from-bottom-2">
          <p className="font-label text-[10px] tracking-[0.25em] text-accent uppercase">
            {WEEKDAY[dow(cell.date)]} {ddmm(cell.date)} · {main?.name}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cellSlots.map((s) => (
              <button
                key={s.start}
                type="button"
                onClick={() => {
                  setSlot(s);
                  setSlotStaff(null);
                }}
                aria-pressed={slot?.start === s.start}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm tabular-nums transition",
                  slot?.start === s.start ? "border-accent bg-accent text-accent-foreground" : "border-border hover:border-accent/60",
                )}
              >
                {s.time}
                {s.discount > 0 && <span className="ml-1 text-[10px] opacity-80">-{s.discount}%</span>}
              </button>
            ))}
          </div>

          {slot && <SlotStaff slot={slot} staff={staff} staffId={staffId} chosen={slotStaff} onChoose={setSlotStaff} t={t} />}

          <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
            {me ? (
              <p className="flex flex-wrap items-center gap-x-2 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm sm:col-span-2">
                <span className="text-muted-foreground">{t.agenda.bookingAs}</span>
                <b className="font-medium">{me.name}</b>
                {me.phone && <span className="text-muted-foreground">· {me.phone}</span>}
                <a href="/perfil" className="ml-auto text-xs text-accent hover:underline">
                  {t.agenda.notYou}
                </a>
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground sm:col-span-2">{t.agenda.requiredInfo}</p>
                <input
                  required
                  autoComplete="name"
                  placeholder={t.agenda.name}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-12 rounded-xl border border-border bg-background/60 px-4 text-sm outline-none focus:border-accent/60"
                />
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  placeholder={t.agenda.phone}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="h-12 rounded-xl border border-border bg-background/60 px-4 text-sm outline-none focus:border-accent/60"
                />
                <input
                  required
                  type="email"
                  autoComplete="email"
                  placeholder={t.agenda.email}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="h-12 rounded-xl border border-border bg-background/60 px-4 text-sm outline-none focus:border-accent/60"
                />
                <label className="relative block">
                  <span className="pointer-events-none absolute top-1.5 left-4 text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {t.agenda.birthday}
                  </span>
                  <input
                    required
                    type="date"
                    autoComplete="bday"
                    max={today}
                    value={form.birthDate}
                    onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                    aria-label={t.agenda.birthday}
                    className="h-12 w-full rounded-xl border border-border bg-background/60 px-4 pt-4 text-sm outline-none [color-scheme:dark] focus:border-accent/60"
                  />
                </label>
              </>
            )}
            <input
              placeholder={t.agenda.notes}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="h-12 rounded-xl border border-border bg-background/60 px-4 text-sm outline-none focus:border-accent/60 sm:col-span-2"
            />
            <input
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={submitting || !slot}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7 font-label text-xs tracking-[0.2em] text-accent-foreground uppercase transition hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />}
                {t.agenda.reserve} {slot?.time}
              </button>
              <p className="text-xs text-muted-foreground">{t.agenda.noPayment}</p>
            </div>
          </form>
        </div>
      )}

      {booking && <Confirmation booking={booking} t={t} saved={saved} onClose={() => (setBooking(null), setSaved(null))} />}

      <p className="mt-auto flex items-center gap-2 pt-6 text-xs text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", failed ? "bg-destructive" : "bg-emerald-400")} />
        {loading ? t.agenda.syncing : t.agenda.synced}
      </p>
    </div>
  );
}

function Confirmation({ booking, onClose, t, saved }: { booking: BookingSummary; onClose: () => void; t: UiDict; saved: "saved" | "exists" | null }) {
  const confirmed = booking.status === "confirmed";
  return (
    <div className="mt-6 rounded-2xl border border-accent/50 bg-accent/10 p-5 animate-in fade-in zoom-in-95">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-label text-[10px] tracking-[0.25em] text-accent uppercase">
            {confirmed ? t.booking.confirmed : t.booking.pending}
          </p>
          <p className="mt-1 font-serif text-2xl">{booking.services.join(" + ")}</p>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{booking.when}</p>
          {booking.staffName && (
            <p className="text-sm text-muted-foreground">
              {t.booking.with} {booking.staffName}
            </p>
          )}
        </div>
        <span className="rounded-lg border border-accent/40 px-2.5 py-1 font-mono text-sm text-accent">#{booking.code}</span>
      </div>
      {saved === "saved" && <p className="mt-3 text-xs text-emerald-300">✓ {t.booking.profileSaved}</p>}
      {saved === "exists" && <p className="mt-3 text-xs text-muted-foreground">{t.me.exists}</p>}
      {!confirmed &&
        (booking.confirmationSent ? (
          <p className="mt-4 text-sm">{t.booking.sentWhatsapp}</p>
        ) : booking.confirmUrl ? (
          <a
            href={booking.confirmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-medium text-white transition hover:brightness-95"
          >
            <MessageCircle className="size-4" /> {t.booking.confirmWhatsapp}
          </a>
        ) : (
          <p className="mt-4 text-sm">{t.booking.salonWillContact}</p>
        ))}
      <button type="button" onClick={onClose} className="mt-4 block text-xs text-muted-foreground underline-offset-4 hover:underline">
        {t.booking.another}
      </button>
    </div>
  );
}

/** Quem vai fazer o serviço na hora escolhida: a profissional escolhida, a única livre, ou escolha entre as livres. */
function SlotStaff({
  slot,
  staff,
  staffId,
  chosen,
  onChoose,
  t,
}: {
  slot: AgendaSlot;
  staff: SiteStaff[];
  staffId: string | null;
  chosen: string | null;
  onChoose: (id: string | null) => void;
  t: UiDict;
}) {
  const free = (staffId ? [staffId] : slot.staffIds).map((id) => staff.find((p) => p.id === id)).filter((p): p is SiteStaff => !!p);
  if (!free.length) return null;
  if (free.length === 1) {
    const p = free[0];
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
        <Avatar p={p} size={44} />
        <div className="leading-tight">
          <p className="font-label text-[10px] tracking-[0.25em] text-accent uppercase">{t.agenda.proAtTime}</p>
          <p className="mt-1 font-serif text-lg">{p.name}</p>
          {p.jobTitle && <p className="text-xs text-muted-foreground">{p.jobTitle}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4">
      <p className="font-label text-[10px] tracking-[0.25em] text-accent uppercase">{t.agenda.pickProAtTime}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t.agenda.pickProAtTime}>
        {[null, ...free].map((p) => (
          <button
            key={p?.id ?? "any"}
            type="button"
            role="radio"
            aria-checked={chosen === (p?.id ?? null)}
            onClick={() => onChoose(p?.id ?? null)}
            className={cn(
              "flex items-center gap-2 rounded-full border py-1 pr-4 pl-1 text-sm transition",
              chosen === (p?.id ?? null) ? "border-accent bg-accent text-accent-foreground" : "border-border hover:border-accent/60",
            )}
          >
            {p ? (
              <Avatar p={p} size={28} />
            ) : (
              <span className="grid size-7 place-items-center rounded-full border border-current/30">
                <User className="size-3" />
              </span>
            )}
            {p?.name ?? t.agenda.anyStaff}
          </button>
        ))}
      </div>
    </div>
  );
}
