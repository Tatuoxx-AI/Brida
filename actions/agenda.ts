"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { query } from "@/lib/db";
import { createBooking, type BookingSummary } from "@/lib/booking";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { currentClientId, rememberClient } from "@/lib/client-session";
import { getLocale } from "@/lib/i18n/server";
import { LOCALE_INFO } from "@/lib/i18n/locales";

// Server Actions da agenda online (secção "Agenda" da landing).

const TZ = "Europe/Lisbon";
const timeFmt = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** Uma hora livre e as profissionais que a podem fazer (para a cliente saber com quem marca). */
export type AgendaSlot = { start: string; time: string; discount: number; staffIds: string[] };
/** `booked`: horas (0–23) que já têm marcação — mostram o carimbo "B" na grelha. */
export type AgendaDay = { date: string; closed: boolean; slots: AgendaSlot[]; booked: number[] };
export type AgendaBookingResult =
  | { ok: true; booking: BookingSummary; profileSaved: boolean; profileExists: boolean }
  | { ok: false; error: string; code: string };

const uuid = z.string().uuid();
const serviceIds = z.array(uuid).min(1).max(5);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Vagas de `days` dias seguidos a partir de `from` (uma linha por início possível). */
export async function getWeekSlots(from: string, days: number, ids: string[], staffId: string | null): Promise<AgendaDay[]> {
  isoDate.parse(from);
  serviceIds.parse(ids);
  if (staffId) uuid.parse(staffId);
  const n = z.number().int().min(1).max(7).parse(days);

  const rows = await query<{ day: string; closed: boolean; slot_start: string | null; discount_percent: number | null; staff_ids: string[] | null }>(
    `select d::date as day,
            coalesce(b.is_closed, true) as closed,
            g.slot_start, g.discount_percent, g.staff_ids
       from generate_series($1::date, $1::date + ($2::int - 1), interval '1 day') d
       left join public.business_hours b on b.weekday = extract(dow from d)
       left join lateral (
         select slot_start, max(discount_percent) as discount_percent, array_agg(staff_id::text order by staff_name) as staff_ids
           from public.get_available_slots(d::date, $3::uuid[], $4::uuid)
          group by slot_start
       ) g on true
      order by d, g.slot_start`,
    [from, n, ids, staffId],
  );

  // horas com marcação (para o carimbo "B" na grelha) — só a hora, nada sobre a cliente
  const busy = await query<{ day: string; hour: number }>(
    `with s as (select coalesce((select timezone from public.salon_settings where id = 1), 'Europe/Lisbon') as tz)
     select distinct to_char(h, 'YYYY-MM-DD') as day, extract(hour from h)::int as hour
       from public.appointments a, s,
            generate_series(date_trunc('hour', a.start_time at time zone s.tz),
                            (a.end_time at time zone s.tz) - interval '1 second', interval '1 hour') h
      where a.status in ('pending', 'confirmed', 'in_progress')
        and a.start_time < ($1::date + $2::int)::timestamp at time zone s.tz
        and a.end_time > $1::date::timestamp at time zone s.tz
        and ($3::uuid is null or a.staff_id = $3::uuid)`,
    [from, n, staffId],
  );

  const out = new Map<string, AgendaDay>();
  for (const r of rows) {
    const day = out.get(r.day) ?? { date: r.day, closed: r.closed, slots: [], booked: busy.filter((b) => b.day === r.day).map((b) => b.hour) };
    if (r.slot_start) {
      day.slots.push({ start: r.slot_start, time: timeFmt.format(new Date(r.slot_start)), discount: Number(r.discount_percent ?? 0), staffIds: r.staff_ids ?? [] });
    }
    out.set(r.day, day);
  }
  return [...out.values()];
}

const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Indique a data de aniversário.")
  .refine((d) => {
    const age = (Date.now() - new Date(`${d}T12:00:00Z`).getTime()) / (365.25 * 864e5);
    return age >= 3 && age <= 110;
  }, "Data de aniversário inválida.");

const BookInput = z.object({
  serviceIds,
  staffId: uuid.nullable().optional(),
  start: z.string().datetime({ offset: true }),
  // dados do cliente: obrigatórios, exceto quando o aparelho já tem o perfil guardado
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  birthDate: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  // armadilha para bots: campo escondido que pessoas não preenchem
  website: z.string().max(0).optional(),
});

const ClientData = z.object({
  name: z.string().trim().min(2, "Escreva o seu nome.").max(80),
  phone: z.string().trim().min(6, "Escreva o seu telemóvel.").max(30),
  email: z.string().trim().email("Escreva um email válido.").max(120),
  birthDate,
});

export async function bookFromAgenda(raw: z.input<typeof BookInput>): Promise<AgendaBookingResult> {
  const parsed = BookInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos.", code: "INVALID" };
  const input = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`agenda:${ip}`, 5, 15 * 60_000)) {
    return { ok: false, error: "Muitas marcações seguidas. Tente daqui a pouco ou ligue-nos.", code: "RATE_LIMIT" };
  }

  const intl = LOCALE_INFO[await getLocale()].intl;
  const deviceClient = await currentClientId();

  // aparelho com perfil guardado: marca diretamente na ficha dele
  if (deviceClient) {
    const r = await createBooking({
      serviceIds: input.serviceIds,
      staffId: input.staffId ?? null,
      start: input.start,
      name: input.name ?? "",
      phone: input.phone ?? "",
      notes: input.notes,
      source: "web",
      profileId: deviceClient,
      intl,
    });
    return r.ok ? { ok: true, booking: r.booking, profileSaved: true, profileExists: false } : r;
  }

  const c = ClientData.safeParse(input);
  if (!c.success) return { ok: false, error: c.error.issues[0]?.message ?? "Dados inválidos.", code: "INVALID" };
  if (!normalizePhone(c.data.phone)) {
    return { ok: false, error: "Telemóvel inválido. Ex.: 912 345 678 ou +351 912 345 678.", code: "INVALID_PHONE" };
  }

  const r = await createBooking({
    serviceIds: input.serviceIds,
    staffId: input.staffId ?? null,
    start: input.start,
    name: c.data.name,
    phone: c.data.phone,
    email: c.data.email,
    birthDate: c.data.birthDate,
    notes: input.notes,
    source: "web",
    intl,
  });
  if (!r.ok) return r;
  // guarda o perfil neste aparelho (só se a ficha é desta pessoa — ver resolveClient)
  if (r.verified) await rememberClient(r.clientId);
  return { ok: true, booking: r.booking, profileSaved: r.verified, profileExists: !r.verified };
}
