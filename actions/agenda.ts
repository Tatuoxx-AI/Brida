"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { query } from "@/lib/db";
import { createBooking, type BookingSummary } from "@/lib/booking";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";

// Server Actions da agenda online (secção "Agenda" da landing).

const TZ = "Europe/Lisbon";
const timeFmt = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export type AgendaSlot = { start: string; time: string; discount: number };
export type AgendaDay = { date: string; closed: boolean; slots: AgendaSlot[] };
export type AgendaBookingResult = { ok: true; booking: BookingSummary } | { ok: false; error: string; code: string };

const uuid = z.string().uuid();
const serviceIds = z.array(uuid).min(1).max(5);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Vagas de `days` dias seguidos a partir de `from` (uma linha por início possível). */
export async function getWeekSlots(from: string, days: number, ids: string[], staffId: string | null): Promise<AgendaDay[]> {
  isoDate.parse(from);
  serviceIds.parse(ids);
  if (staffId) uuid.parse(staffId);
  const n = z.number().int().min(1).max(7).parse(days);

  const rows = await query<{ day: string; closed: boolean; slot_start: string | null; discount_percent: number | null }>(
    `select d::date as day,
            coalesce(b.is_closed, true) as closed,
            g.slot_start, g.discount_percent
       from generate_series($1::date, $1::date + ($2::int - 1), interval '1 day') d
       left join public.business_hours b on b.weekday = extract(dow from d)
       left join lateral (
         select distinct on (slot_start) slot_start, discount_percent
           from public.get_available_slots(d::date, $3::uuid[], $4::uuid)
          order by slot_start
       ) g on true
      order by d, g.slot_start`,
    [from, n, ids, staffId],
  );

  const out = new Map<string, AgendaDay>();
  for (const r of rows) {
    const day = out.get(r.day) ?? { date: r.day, closed: r.closed, slots: [] };
    if (r.slot_start) {
      day.slots.push({ start: r.slot_start, time: timeFmt.format(new Date(r.slot_start)), discount: Number(r.discount_percent ?? 0) });
    }
    out.set(r.day, day);
  }
  return [...out.values()];
}

const BookInput = z.object({
  serviceIds,
  staffId: uuid.nullable().optional(),
  start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(2, "Escreva o seu nome.").max(80),
  phone: z.string().trim().min(6, "Escreva o seu telemóvel.").max(30),
  notes: z.string().trim().max(500).optional(),
  // armadilha para bots: campo escondido que pessoas não preenchem
  website: z.string().max(0).optional(),
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
  if (!normalizePhone(input.phone)) {
    return { ok: false, error: "Telemóvel inválido. Ex.: 912 345 678 ou +351 912 345 678.", code: "INVALID_PHONE" };
  }

  return createBooking({
    serviceIds: input.serviceIds,
    staffId: input.staffId ?? null,
    start: input.start,
    name: input.name,
    phone: input.phone,
    notes: input.notes,
    source: "web",
  });
}
