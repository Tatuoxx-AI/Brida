"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exec, one, query } from "@/lib/db";
import { resolveClient } from "@/lib/booking";
import { normalizePhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { currentClientId, forgetClient, rememberClient } from "@/lib/client-session";
import { pushToManagers } from "@/lib/push";

// Área "O meu perfil" do cliente (perfil guardado no aparelho, sem senha).
// Tudo o que mexe em dados confirma primeiro que a ficha é a deste aparelho.

type Result = { ok: true } | { ok: false; code: string };

const birthDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const age = (Date.now() - new Date(`${d}T12:00:00Z`).getTime()) / (365.25 * 864e5);
    return age >= 3 && age <= 110;
  });
const Profile = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(120),
  birthDate,
});

async function limited(key: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return !rateLimit(`${key}:${ip}`, 8, 15 * 60_000);
}

/** Cria (ou reencontra) a ficha e guarda-a neste aparelho. */
export async function createMyProfile(raw: z.input<typeof Profile>): Promise<Result> {
  if (await limited("perfil")) return { ok: false, code: "RATE_LIMIT" };
  const p = Profile.safeParse(raw);
  if (!p.success) return { ok: false, code: "INVALID" };
  if (!normalizePhone(p.data.phone)) return { ok: false, code: "INVALID_PHONE" };
  const r = await resolveClient(p.data.name, p.data.phone, { email: p.data.email, birthDate: p.data.birthDate });
  if (!r.ok) return { ok: false, code: "INVALID" };
  if (!r.verified) return { ok: false, code: "EXISTS" };
  await rememberClient(r.id);
  revalidatePath("/perfil");
  return { ok: true };
}

/** Atualiza nome/email/aniversário (o telemóvel identifica a ficha e não muda aqui). */
export async function updateMyProfile(raw: { name: string; email: string; birthDate: string }): Promise<Result> {
  const id = await currentClientId();
  if (!id) return { ok: false, code: "NO_PROFILE" };
  const p = Profile.pick({ name: true, email: true, birthDate: true }).safeParse(raw);
  if (!p.success) return { ok: false, code: "INVALID" };
  try {
    await exec(`update public.profiles set name = $2, email = $3, birth_date = $4::date where id = $1 and role = 'client'`, [
      id,
      p.data.name,
      p.data.email.toLowerCase(),
      p.data.birthDate,
    ]);
  } catch {
    return { ok: false, code: "EMAIL_TAKEN" };
  }
  revalidatePath("/perfil");
  return { ok: true };
}

export type MyAppointment = { id: string; code: string; start: string; services: string; staff: string; status: string; canCancel: boolean };

export async function myAppointments(locale = "pt"): Promise<{ upcoming: MyAppointment[]; past: MyAppointment[] }> {
  const id = await currentClientId();
  if (!id) return { upcoming: [], past: [] };
  const rows = await query<MyAppointment & { future: boolean }>(
    `select a.id, a.code, a.start_time as start, st.name as staff, a.status::text as status,
            coalesce((select string_agg(coalesce(sv.i18n -> $2 ->> 'name', sv.name), ' + ' order by s.position) from public.appointment_services s
                      join public.services sv on sv.id = s.service_id where s.appointment_id = a.id),
                     (select name from public.services where id = a.service_id)) as services,
            a.start_time >= now() as future,
            (a.status in ('pending', 'confirmed')
              and a.start_time - now() >= make_interval(hours => (select cancellation_window_hours from public.salon_settings where id = 1))) as "canCancel"
       from public.appointments a join public.profiles st on st.id = a.staff_id
      where a.client_id = $1
      order by a.start_time desc limit 40`,
    [id, locale],
  );
  return {
    upcoming: rows.filter((r) => r.future && r.status !== "cancelled").reverse(),
    past: rows.filter((r) => !r.future || r.status === "cancelled"),
  };
}

export async function cancelMyAppointment(appointmentId: string): Promise<Result> {
  const id = await currentClientId();
  if (!id) return { ok: false, code: "NO_PROFILE" };
  if (!z.string().uuid().safeParse(appointmentId).success) return { ok: false, code: "INVALID" };
  const ap = await one<{ code: string; when: string }>(
    `update public.appointments a
        set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Cancelado pelo cliente (site)', cancelled_by = $2
      where a.id = $1 and a.client_id = $2 and a.status in ('pending', 'confirmed')
        and a.start_time - now() >= make_interval(hours => (select cancellation_window_hours from public.salon_settings where id = 1))
      returning a.code, to_char(a.start_time at time zone 'Europe/Lisbon', 'DD/MM HH24:MI') as "when"`,
    [appointmentId, id],
  );
  if (!ap) return { ok: false, code: "TOO_LATE" };
  void pushToManagers({ title: "Marcação cancelada pelo cliente", body: `#${ap.code} · ${ap.when}`, tag: `ap-${appointmentId}` });
  revalidatePath("/perfil");
  return { ok: true };
}

export async function requestMyReward(): Promise<Result> {
  const id = await currentClientId();
  if (!id) return { ok: false, code: "NO_PROFILE" };
  const r = await one<{ id: string }>(
    `insert into public.loyalty_redemptions (client_id, stamps, reward)
     select p.id, s.loyalty_stamps_required, s.loyalty_reward
       from public.profiles p, public.salon_settings s
      where p.id = $1 and s.id = 1 and p.loyalty_points >= s.loyalty_stamps_required
        and not exists (select 1 from public.loyalty_redemptions r where r.client_id = p.id and r.status = 'pending')
     returning id`,
    [id],
  );
  if (!r) return { ok: false, code: "NOT_ENOUGH" };
  void pushToManagers({ title: "Pedido de recompensa", body: "Uma cliente completou o cartão de fidelidade.", tag: `rw-${r.id}` });
  return { ok: true };
}

export async function forgetThisDevice(): Promise<Result> {
  await forgetClient();
  revalidatePath("/perfil");
  return { ok: true };
}
