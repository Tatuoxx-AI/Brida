"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, exec, one, query } from "@/lib/db";
import { checkPassword, endManagerSession, requireManager, startManagerSession } from "@/lib/manager-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getWidgetAgenda, hashWidgetToken, newWidgetToken, type WidgetAgenda } from "@/lib/widget";
import { normalizePhone } from "@/lib/phone";
import { bookingError, resolveClient } from "@/lib/booking";
import { invalidateAgentCache } from "@/lib/ai/agent";
import { notifyTelegram } from "@/lib/notify";
import { open, seal } from "@/lib/secret-box";
import { pushToManagers } from "@/lib/push";
import { translateObject } from "@/lib/ai/translate";
import { resolveContent } from "@/lib/site-data";
import { DEFAULT_CONTENT, NEUTRAL_KEYS, type ContentKey, type Review, type SiteContent, type Stat } from "@/lib/i18n/content";
import type { Locale } from "@/lib/i18n/locales";
import type { AppointmentStatus, BusinessHoursRow, NoteKind, ServiceCategory } from "@/types/database";

// Server Actions do painel do gerente. TODAS começam por requireManager().

const TZ = "Europe/Lisbon";
type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** O que o gerente muda no painel tem de aparecer logo no site e na IA. */
function siteChanged() {
  invalidateAgentCache();
  revalidatePath("/", "layout");
}

// =============================================================================
// Sessão
// =============================================================================
export async function managerLogin(password: string): Promise<Result> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`mgr-login:${ip}`, 5, 15 * 60_000)) return fail("Demasiadas tentativas. Espere 15 minutos.");
  if (!checkPassword(String(password ?? ""))) return fail("Senha incorreta.");
  await startManagerSession();
  return { ok: true };
}

export async function managerLogout() {
  await endManagerSession();
}

/** Chamado ao abrir o painel: estende a sessão por mais 1 ano (fica sempre ligada). */
export async function mgrKeepAlive(): Promise<boolean> {
  await requireManager();
  await startManagerSession();
  return true;
}

// =============================================================================
// Notificações push no telemóvel do gerente
// =============================================================================
const PushSub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(5).max(100) }),
});

export async function mgrSavePush(raw: unknown, userAgent: string): Promise<Result> {
  await requireManager();
  const p = PushSub.safeParse(raw);
  if (!p.success) return fail("Subscrição inválida.");
  await exec(
    `insert into public.push_subscriptions (endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4)
     on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    [p.data.endpoint, p.data.keys.p256dh, p.data.keys.auth, String(userAgent ?? "").slice(0, 300)],
  );
  return { ok: true };
}

export async function mgrRemovePush(endpoint: string): Promise<Result> {
  await requireManager();
  await exec(`delete from public.push_subscriptions where endpoint = $1`, [String(endpoint ?? "")]);
  return { ok: true };
}

export async function mgrTestPush(): Promise<Result> {
  await requireManager();
  const n = await pushToManagers({ title: "Brida · Painel", body: "✅ As notificações de marcações estão ativas neste aparelho.", tag: "teste" });
  return n > 0 ? { ok: true } : fail("Nenhum aparelho recebeu. Ative as notificações primeiro.");
}

export async function mgrPushDevices(): Promise<number> {
  await requireManager();
  return (await one<{ n: number }>(`select count(*)::int as n from public.push_subscriptions`))?.n ?? 0;
}

// =============================================================================
// Notificações (barra do topo)
// =============================================================================
export type MgrEvent = { id: number; type: string; title: string; body: string | null; created_at: string; read: boolean };

export async function mgrEvents(): Promise<{ events: MgrEvent[]; unread: number }> {
  await requireManager();
  const events = await query<MgrEvent>(
    `select id, type::text, title, body, created_at, read_at is not null as read
       from public.admin_events order by id desc limit 25`,
  );
  return { events, unread: events.filter((e) => !e.read).length };
}

export async function mgrMarkEventsRead() {
  await requireManager();
  await exec(`update public.admin_events set read_at = now() where read_at is null`);
}

// =============================================================================
// Agenda
// =============================================================================
export type MgrDayCount = { date: string; total: number; pending: number; blocked: boolean };
export type MgrAppointment = {
  id: string;
  code: string;
  start: string;
  time: string;
  end_time: string;
  date: string;
  client_id: string | null;
  client: string;
  phone: string | null;
  services: string;
  staff: string;
  status: AppointmentStatus;
  total: number;
  notes: string | null;
  source: string;
};

const APPT_SELECT = `
  select a.id, a.code, a.start_time as start,
         to_char(a.start_time at time zone '${TZ}', 'HH24:MI') as time,
         to_char(a.end_time at time zone '${TZ}', 'HH24:MI') as end_time,
         (a.start_time at time zone '${TZ}')::date::text as date,
         a.client_id, coalesce(p.name, a.guest_name, 'Cliente') as client,
         coalesce(p.phone, a.guest_phone) as phone,
         coalesce((select string_agg(sv.name, ' + ' order by s.position) from public.appointment_services s
                   join public.services sv on sv.id = s.service_id where s.appointment_id = a.id),
                  (select name from public.services where id = a.service_id)) as services,
         st.name as staff, a.status::text as status, a.total_price as total, a.notes, a.source::text as source
    from public.appointments a
    left join public.profiles p on p.id = a.client_id
    join public.profiles st on st.id = a.staff_id`;

export async function mgrMonth(month: string): Promise<MgrDayCount[]> {
  await requireManager();
  z.string().regex(/^\d{4}-\d{2}$/).parse(month);
  return query<MgrDayCount>(
    `with days as (
       select d::date as day from generate_series($1::date, $1::date + interval '1 month' - interval '1 day', interval '1 day') d
     )
     select days.day::text as date,
            (select count(*) from public.appointments a
              where (a.start_time at time zone $2)::date = days.day and a.status not in ('cancelled'))::int as total,
            (select count(*) from public.appointments a
              where (a.start_time at time zone $2)::date = days.day and a.status = 'pending')::int as pending,
            exists (select 1 from public.blocked_slots b
                     where b.staff_id is null
                       and tstzrange(b.start_time, b.end_time) @> ((days.day + time '12:00') at time zone $2)) as blocked
       from days order by days.day`,
    [`${month}-01`, TZ],
  );
}

export async function mgrDay(date: string): Promise<MgrAppointment[]> {
  await requireManager();
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
  return query<MgrAppointment>(`${APPT_SELECT} where (a.start_time at time zone $1)::date = $2::date order by a.start_time`, [TZ, date]);
}

export async function mgrPending(): Promise<MgrAppointment[]> {
  await requireManager();
  return query<MgrAppointment>(`${APPT_SELECT} where a.status = 'pending' and a.start_time >= now() order by a.start_time limit 50`);
}

const STATUSES = ["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;

export async function mgrSetStatus(id: string, status: AppointmentStatus): Promise<Result> {
  await requireManager();
  z.string().uuid().parse(id);
  z.enum(STATUSES).parse(status);
  try {
    await exec(
      `update public.appointments
          set status = $2::public.appointment_status,
              cancelled_at = case when $2 = 'cancelled' then now() else cancelled_at end,
              cancel_reason = case when $2 = 'cancelled' then coalesce(cancel_reason, 'Cancelado pelo salão') else cancel_reason end
        where id = $1`,
      [id, status],
    );
    return { ok: true };
  } catch (e) {
    // voltar a ativar uma marcação cancelada pode chocar com outra no mesmo horário
    return fail(dbErrorMessage(e).includes("appointments_no_overlap") ? "Esse horário já está ocupado por outra marcação." : "Não foi possível alterar.");
  }
}

export async function mgrBlockedDays(): Promise<{ id: string; date: string; reason: string | null }[]> {
  await requireManager();
  return query(
    `select id, (start_time at time zone $1)::date::text as date, reason
       from public.blocked_slots
      where staff_id is null and end_time > now()
      order by start_time`,
    [TZ],
  );
}

export async function mgrBlockDay(date: string, reason: string): Promise<Result> {
  await requireManager();
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
  await exec(
    `insert into public.blocked_slots (staff_id, start_time, end_time, reason)
     values (null, $1::date at time zone $2, ($1::date + 1) at time zone $2, nullif($3, ''))`,
    [date, TZ, reason.trim().slice(0, 120)],
  );
  siteChanged();
  return { ok: true };
}

export async function mgrUnblock(id: string): Promise<Result> {
  await requireManager();
  z.string().uuid().parse(id);
  await exec(`delete from public.blocked_slots where id = $1`, [id]);
  siteChanged();
  return { ok: true };
}

const NewAppt = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(30),
  notes: z.string().trim().max(500).optional(),
});

/** Marcação feita pelo salão (telefone/balcão): fica logo confirmada. */
export async function mgrCreateAppointment(raw: z.input<typeof NewAppt>): Promise<Result> {
  await requireManager();
  const parsed = NewAppt.safeParse(raw);
  if (!parsed.success) return fail("Preencha serviço, profissional, dia, hora, nome e telefone.");
  const a = parsed.data;
  const client = await resolveClient(a.name, a.phone, {});
  if (!client.ok) return fail(client.error);
  try {
    await query(
      `select id from public.book_appointment(
         array[$1::uuid], ($2::date + $3::time) at time zone $4, $5::uuid, $6::uuid, null, null, 'admin', $7)`,
      [a.serviceId, a.date, a.time, TZ, a.staffId, client.id, a.notes ?? null],
    );
    return { ok: true };
  } catch (e) {
    return fail(bookingError(dbErrorMessage(e)).error);
  }
}

// =============================================================================
// Estatísticas
// =============================================================================
export type MgrStats = {
  clients: number;
  appointments: number;
  revenue: number;
  pending: number;
  months: { month: string; revenue: number; clients: number; appointments: number }[];
};

export async function mgrStats(): Promise<MgrStats> {
  await requireManager();
  const months = await query<MgrStats["months"][number]>(
    `with m as (
       select generate_series(date_trunc('month', now() at time zone $1) - interval '11 months',
                              date_trunc('month', now() at time zone $1), interval '1 month') as month
     )
     select to_char(m.month, 'YYYY-MM') as month,
            coalesce(sum(a.total_price) filter (where a.status = 'completed'), 0) as revenue,
            count(distinct coalesce(a.client_id::text, a.guest_phone, a.guest_name)) filter (where a.status in ('confirmed', 'in_progress', 'completed'))::int as clients,
            count(a.id) filter (where a.status <> 'cancelled')::int as appointments
       from m
       left join public.appointments a on date_trunc('month', a.start_time at time zone $1) = m.month
      group by m.month order by m.month`,
    [TZ],
  );
  const totals = await one<{ clients: number; appointments: number; revenue: number; pending: number }>(
    `select count(distinct coalesce(client_id::text, guest_phone, guest_name)) filter (where status in ('confirmed', 'in_progress', 'completed'))::int as clients,
            count(*) filter (where status <> 'cancelled')::int as appointments,
            coalesce(sum(total_price) filter (where status = 'completed'), 0) as revenue,
            count(*) filter (where status = 'pending' and start_time >= now())::int as pending
       from public.appointments
      where start_time >= now() - interval '12 months'`,
  );
  return { ...(totals ?? { clients: 0, appointments: 0, revenue: 0, pending: 0 }), months };
}

// =============================================================================
// Clientes
// =============================================================================
export type MgrClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stamps: number;
  visits: number;
  last_visit: string | null;
  next_visit: string | null;
};

export async function mgrClients(search: string): Promise<MgrClient[]> {
  await requireManager();
  const q = search.trim().slice(0, 60);
  return query<MgrClient>(
    `select p.id, p.name, p.phone, p.email, p.loyalty_points as stamps,
            (select count(*) from public.appointments a where a.client_id = p.id and a.status = 'completed')::int as visits,
            (select max(start_time) from public.appointments a where a.client_id = p.id and a.status = 'completed') as last_visit,
            (select min(start_time) from public.appointments a where a.client_id = p.id and a.status in ('pending', 'confirmed') and a.start_time >= now()) as next_visit
       from public.profiles p
      where p.role = 'client'
        and ($1 = '' or p.name ilike '%' || $1 || '%' or replace(coalesce(p.phone, ''), ' ', '') like '%' || replace($1, ' ', '') || '%')
      order by p.name
      limit 150`,
    [q],
  );
}

export async function mgrAddClient(raw: { name: string; phone: string; email?: string; birth_date?: string }): Promise<Result> {
  await requireManager();
  const name = String(raw.name ?? "").trim();
  if (name.length < 2) return fail("Escreva o nome.");
  const phone = normalizePhone(String(raw.phone ?? ""));
  if (!phone) return fail("Telefone inválido.");
  const email = String(raw.email ?? "").trim() || null;
  if (email && !z.string().email().safeParse(email).success) return fail("E-mail inválido.");
  const birth = String(raw.birth_date ?? "").trim() || null;
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return fail("Data de nascimento inválida.");
  try {
    await exec(`insert into public.profiles (name, phone, email, birth_date, role) values ($1, $2, $3, $4::date, 'client')`, [name, phone, email, birth]);
    return { ok: true };
  } catch (e) {
    const m = dbErrorMessage(e);
    return fail(m.includes("profiles_phone_key") ? "Já existe uma cliente com esse telefone." : m.includes("profiles_email_key") ? "Já existe uma cliente com esse e-mail." : "Não foi possível guardar.");
  }
}

export type MgrNote = { id: string; kind: NoteKind; content: string; created_at: string };

export async function mgrClientDetail(clientId: string): Promise<{ notes: MgrNote[]; history: MgrAppointment[] }> {
  await requireManager();
  z.string().uuid().parse(clientId);
  const [notes, history] = await Promise.all([
    query<MgrNote>(`select id, kind::text as kind, content, created_at from public.client_notes where client_id = $1 order by created_at desc`, [clientId]),
    query<MgrAppointment>(`${APPT_SELECT} where a.client_id = $1 order by a.start_time desc limit 20`, [clientId]),
  ]);
  return { notes, history };
}

export async function mgrAddClientNote(clientId: string, content: string, kind: NoteKind): Promise<Result> {
  await requireManager();
  z.string().uuid().parse(clientId);
  z.enum(["tecnica", "geral", "alergia"]).parse(kind);
  const text = content.trim().slice(0, 2000);
  if (!text) return fail("A nota está vazia.");
  await exec(`insert into public.client_notes (client_id, content, kind) values ($1, $2, $3::public.note_kind)`, [clientId, text, kind]);
  return { ok: true };
}

export async function mgrAdjustStamps(clientId: string, delta: number): Promise<Result> {
  await requireManager();
  z.string().uuid().parse(clientId);
  const d = z.number().int().min(-50).max(50).refine((n) => n !== 0).parse(delta);
  try {
    await exec(`insert into public.loyalty_transactions (client_id, points, reason) values ($1, $2, 'Ajuste no painel')`, [clientId, d]);
    return { ok: true };
  } catch {
    return fail("A cliente não tem carimbos suficientes.");
  }
}

// =============================================================================
// Editar site
// =============================================================================
export type MgrService = {
  id: string;
  name: string;
  description: string | null;
  category: ServiceCategory;
  duration_minutes: number;
  price: number;
  is_addon: boolean;
  active: boolean;
  sort_order: number;
};
export type MgrStaff = {
  id: string;
  name: string;
  active: boolean;
  services: number;
  avatar_url: string | null;
  job_title: string | null;
  socials: { instagram?: string; facebook?: string; tiktok?: string };
  team_order: number;
};
export type MgrBusiness = {
  name: string;
  area: string | null;
  tagline: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  about: string | null;
};

export async function mgrSiteData(): Promise<{ business: MgrBusiness; hours: BusinessHoursRow[]; services: MgrService[]; staff: MgrStaff[] }> {
  await requireManager();
  const [business, hours, services, staff] = await Promise.all([
    one<MgrBusiness>(
      `select name, area, tagline, phone, whatsapp, email, address, instagram_url, facebook_url, about from public.salon_settings where id = 1`,
    ),
    query<BusinessHoursRow>(`select * from public.business_hours order by weekday`),
    query<MgrService>(
      `select id, name, description, category::text as category, duration_minutes, price, is_addon, active, sort_order
         from public.services order by sort_order, name`,
    ),
    query<MgrStaff>(
      `select p.id, p.name, p.active, (select count(*) from public.staff_services s where s.staff_id = p.id)::int as services,
              p.avatar_url, p.job_title, p.socials, p.team_order
         from public.profiles p where p.role in ('staff', 'admin') order by p.team_order, p.created_at`,
    ),
  ]);
  return { business: business!, hours, services, staff };
}

const optUrl = z.union([z.literal(""), z.string().url().max(300)]);
const Business = z.object({
  name: z.string().trim().min(2).max(120),
  area: z.string().trim().max(120),
  tagline: z.string().trim().max(160),
  phone: z.string().trim().max(30),
  whatsapp: z.string().trim().max(30),
  email: z.union([z.literal(""), z.string().trim().email()]),
  address: z.string().trim().max(200),
  instagram_url: optUrl,
  facebook_url: optUrl,
  about: z.string().trim().max(2000),
});

export async function mgrSaveBusiness(raw: z.input<typeof Business>): Promise<Result> {
  await requireManager();
  const p = Business.safeParse(raw);
  if (!p.success) return fail(`Verifique o campo "${String(p.error.issues[0]?.path[0] ?? "")}".`);
  const b = p.data;
  const phone = b.phone ? normalizePhone(b.phone) : null;
  const whatsapp = b.whatsapp ? normalizePhone(b.whatsapp) : null;
  if (b.phone && !phone) return fail("Telefone inválido.");
  if (b.whatsapp && !whatsapp) return fail("WhatsApp inválido (indicativo + número).");
  await exec(
    `update public.salon_settings set name = $1, area = nullif($2, ''), tagline = nullif($3, ''), phone = $4, whatsapp = $5,
            email = nullif($6, ''), address = nullif($7, ''), instagram_url = nullif($8, ''), facebook_url = nullif($9, ''),
            about = nullif($10, '')
      where id = 1`,
    [b.name, b.area, b.tagline, phone, whatsapp, b.email, b.address, b.instagram_url, b.facebook_url, b.about],
  );
  siteChanged();
  return { ok: true };
}

const Hours = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      is_closed: z.boolean(),
      opens_at: z.string().regex(/^\d{2}:\d{2}/).nullable(),
      closes_at: z.string().regex(/^\d{2}:\d{2}/).nullable(),
    }),
  )
  .length(7);

export async function mgrSaveHours(raw: z.input<typeof Hours>): Promise<Result> {
  await requireManager();
  const p = Hours.safeParse(raw);
  if (!p.success) return fail("Horário inválido.");
  for (const h of p.data) {
    if (!h.is_closed && (!h.opens_at || !h.closes_at || h.opens_at >= h.closes_at)) {
      return fail("Em cada dia aberto, a abertura tem de ser antes do fecho.");
    }
  }
  for (const h of p.data) {
    await exec(`update public.business_hours set is_closed = $2, opens_at = $3::time, closes_at = $4::time where weekday = $1`, [
      h.weekday,
      h.is_closed,
      h.is_closed ? null : h.opens_at,
      h.is_closed ? null : h.closes_at,
    ]);
  }
  siteChanged();
  return { ok: true };
}

const Service = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  category: z.enum(["corte", "coloracao", "tratamento", "penteado", "barbearia", "unhas", "sobrancelhas", "estetica"]),
  duration_minutes: z.number().int().min(5).max(600),
  price: z.number().min(0).max(5000),
  is_addon: z.boolean(),
  active: z.boolean(),
});

export async function mgrSaveService(raw: z.input<typeof Service>): Promise<Result> {
  await requireManager();
  const p = Service.safeParse(raw);
  if (!p.success) return fail("Verifique nome, duração (5–600 min) e preço.");
  const s = p.data;
  if (s.id) {
    await exec(
      `update public.services set name = $2, description = nullif($3, ''), category = $4::public.service_category,
              duration_minutes = $5, price = $6, is_addon = $7, active = $8 where id = $1`,
      [s.id, s.name, s.description ?? "", s.category, s.duration_minutes, s.price, s.is_addon, s.active],
    );
    await translateServices([s.id]);
  } else {
    // serviço novo: todas as profissionais ativas fazem-no (ajustável depois)
    await exec(
      `with sv as (
         insert into public.services (name, description, category, duration_minutes, price, is_addon, active, sort_order)
         values ($1, nullif($2, ''), $3::public.service_category, $4, $5, $6, $7,
                 (select coalesce(max(sort_order), 0) + 10 from public.services))
         returning id
       )
       insert into public.staff_services (staff_id, service_id)
       select p.id, sv.id from sv, public.profiles p where p.role in ('staff', 'admin') and p.active`,
      [s.name, s.description ?? "", s.category, s.duration_minutes, s.price, s.is_addon, s.active],
    );
    const created = await one<{ id: string }>(`select id from public.services where name = $1 order by created_at desc limit 1`, [s.name]);
    if (created) await translateServices([created.id]);
  }
  siteChanged();
  return { ok: true };
}

export async function mgrSaveStaff(raw: { id?: string; name: string; active: boolean }): Promise<Result> {
  await requireManager();
  const name = String(raw.name ?? "").trim();
  if (name.length < 2) return fail("Escreva o nome da profissional.");
  if (raw.id) {
    z.string().uuid().parse(raw.id);
    await exec(`update public.profiles set name = $2, active = $3 where id = $1 and role in ('staff', 'admin')`, [raw.id, name, !!raw.active]);
  } else {
    await exec(
      `with p as (insert into public.profiles (name, role) values ($1, 'staff') returning id)
       insert into public.staff_services (staff_id, service_id) select p.id, s.id from p, public.services s`,
      [name],
    );
  }
  siteChanged();
  return { ok: true };
}

// =============================================================================
// Notas
// =============================================================================
export type MgrManagerNote = { id: string; content: string; pinned: boolean; created_at: string };

export async function mgrNotes(): Promise<MgrManagerNote[]> {
  await requireManager();
  return query<MgrManagerNote>(`select id, content, pinned, created_at from public.manager_notes order by pinned desc, created_at desc`);
}

export async function mgrAddNote(content: string): Promise<Result> {
  await requireManager();
  const text = String(content ?? "").trim().slice(0, 4000);
  if (!text) return fail("A nota está vazia.");
  await exec(`insert into public.manager_notes (content) values ($1)`, [text]);
  return { ok: true };
}

export async function mgrTogglePin(id: string): Promise<Result> {
  await requireManager();
  z.string().uuid().parse(id);
  await exec(`update public.manager_notes set pinned = not pinned, updated_at = now() where id = $1`, [id]);
  return { ok: true };
}

export async function mgrDeleteNote(id: string): Promise<Result> {
  await requireManager();
  z.string().uuid().parse(id);
  await exec(`delete from public.manager_notes where id = $1`, [id]);
  return { ok: true };
}

// =============================================================================
// Automação
// =============================================================================
export type MgrAutomation = {
  auto_confirm_whatsapp: boolean;
  reminder_24h: boolean;
  birthday_message: boolean;
  ai_whatsapp_reply: boolean;
  telegram_notify: boolean;
  whatsapp_phone_number_id: string;
  whatsapp_token_set: string | null; // só os últimos 4 caracteres
  whatsapp_app_secret_set: boolean;
  whatsapp_verify_token: string;
  telegram_token_set: string | null;
  telegram_chat_id: string;
};

const mask = (v: string | null) => (v ? `••••${v.slice(-4)}` : null);

export async function mgrAutomation(): Promise<MgrAutomation> {
  await requireManager();
  const r = await one<Record<string, unknown>>(
    `select s.auto_confirm_whatsapp, s.reminder_24h, s.birthday_message, s.ai_whatsapp_reply, s.telegram_notify, i.*
       from public.salon_settings s cross join public.integration_secrets i where s.id = 1 and i.id = 1`,
  );
  const v = r ?? {};
  return {
    auto_confirm_whatsapp: !!v.auto_confirm_whatsapp,
    reminder_24h: !!v.reminder_24h,
    birthday_message: !!v.birthday_message,
    ai_whatsapp_reply: !!v.ai_whatsapp_reply,
    telegram_notify: !!v.telegram_notify,
    whatsapp_phone_number_id: (v.whatsapp_phone_number_id as string) ?? "",
    whatsapp_token_set: mask(open(v.whatsapp_access_token as string | null)),
    whatsapp_app_secret_set: !!v.whatsapp_app_secret,
    whatsapp_verify_token: open(v.whatsapp_verify_token as string | null) ?? "",
    telegram_token_set: mask(open(v.telegram_bot_token as string | null)),
    telegram_chat_id: (v.telegram_chat_id as string) ?? "",
  };
}

const TOGGLES = ["auto_confirm_whatsapp", "reminder_24h", "birthday_message", "ai_whatsapp_reply", "telegram_notify"] as const;

export async function mgrSetToggle(key: (typeof TOGGLES)[number], value: boolean): Promise<Result> {
  await requireManager();
  const k = z.enum(TOGGLES).parse(key);
  await exec(`update public.salon_settings set ${k} = $1 where id = 1`, [!!value]);
  return { ok: true };
}

/** Campos vazios mantêm o valor guardado; "-" apaga. */
export async function mgrSaveSecrets(raw: Partial<Record<
  "whatsapp_phone_number_id" | "whatsapp_access_token" | "whatsapp_app_secret" | "whatsapp_verify_token" | "telegram_bot_token" | "telegram_chat_id",
  string
>>): Promise<Result> {
  await requireManager();
  const allowed = [
    "whatsapp_phone_number_id",
    "whatsapp_access_token",
    "whatsapp_app_secret",
    "whatsapp_verify_token",
    "telegram_bot_token",
    "telegram_chat_id",
  ] as const;
  // tokens e segredos vão cifrados; ids (número, chat) não são segredo
  const sealed = new Set(["whatsapp_access_token", "whatsapp_app_secret", "whatsapp_verify_token", "telegram_bot_token"]);
  for (const k of allowed) {
    const v = raw[k];
    if (v === undefined || v.trim() === "") continue;
    const value = v.trim() === "-" ? null : v.trim().slice(0, 500);
    await exec(`update public.integration_secrets set ${k} = $1, updated_at = now() where id = 1`, [
      value && sealed.has(k) ? seal(value) : value,
    ]);
  }
  return { ok: true };
}

export async function mgrTestTelegram(): Promise<Result> {
  await requireManager();
  return (await notifyTelegram("✅ Teste do painel Brida Coiffeur: as notificações estão a chegar."))
    ? { ok: true }
    : fail("Não chegou. Verifique o token do bot e o chat id (e se já falou com o bot).");
}

// =============================================================================
// Fidelidade
// =============================================================================
export type MgrRedemption = { id: string; client: string; phone: string | null; stamps: number; reward: string; created_at: string };

export async function mgrLoyalty(): Promise<{ stampsRequired: number; reward: string; redemptions: MgrRedemption[]; ready: { id: string; name: string; stamps: number }[] }> {
  await requireManager();
  const [s, redemptions, ready] = await Promise.all([
    one<{ loyalty_stamps_required: number; loyalty_reward: string }>(
      `select loyalty_stamps_required, loyalty_reward from public.salon_settings where id = 1`,
    ),
    query<MgrRedemption>(
      `select r.id, p.name as client, p.phone, r.stamps, r.reward, r.created_at
         from public.loyalty_redemptions r join public.profiles p on p.id = r.client_id
        where r.status = 'pending' order by r.created_at`,
    ),
    query<{ id: string; name: string; stamps: number }>(
      `select p.id, p.name, p.loyalty_points as stamps from public.profiles p, public.salon_settings s
        where s.id = 1 and p.role = 'client' and p.loyalty_points >= s.loyalty_stamps_required order by p.loyalty_points desc limit 20`,
    ),
  ]);
  return { stampsRequired: s?.loyalty_stamps_required ?? 10, reward: s?.loyalty_reward ?? "", redemptions, ready };
}

export async function mgrSaveLoyalty(stampsRequired: number, reward: string): Promise<Result> {
  await requireManager();
  const n = z.number().int().min(2).max(50).safeParse(stampsRequired);
  if (!n.success) return fail("Entre 2 e 50 carimbos.");
  const r = String(reward ?? "").trim().slice(0, 120);
  if (!r) return fail("Escreva a recompensa.");
  await exec(`update public.salon_settings set loyalty_stamps_required = $1, loyalty_reward = $2 where id = 1`, [n.data, r]);
  // tradução da recompensa para a área de cliente nas outras línguas
  const row = await contentRow();
  const i18n = { ...row.content_i18n } as Record<string, Record<string, unknown>>;
  for (const l of TARGETS) {
    const out = await translateObject({ loyaltyReward: r }, l);
    if (out) i18n[l] = { ...(i18n[l] ?? {}), loyaltyReward: out.loyaltyReward };
  }
  await exec(`update public.salon_settings set content_i18n = $1 where id = 1`, [i18n]);
  siteChanged();
  return { ok: true };
}

/** Aprovar desconta os carimbos; também serve para trocar ao balcão (clientId sem pedido). */
export async function mgrRedeem(input: { redemptionId?: string; clientId?: string; approve: boolean }): Promise<Result> {
  await requireManager();
  const s = await one<{ loyalty_stamps_required: number; loyalty_reward: string }>(
    `select loyalty_stamps_required, loyalty_reward from public.salon_settings where id = 1`,
  );
  if (!s) return fail("Configuração em falta.");
  try {
    if (input.redemptionId) {
      z.string().uuid().parse(input.redemptionId);
      const r = await one<{ client_id: string; stamps: number; reward: string }>(
        `select client_id, stamps, reward from public.loyalty_redemptions where id = $1 and status = 'pending'`,
        [input.redemptionId],
      );
      if (!r) return fail("Pedido já tratado.");
      if (input.approve) {
        await exec(`insert into public.loyalty_transactions (client_id, points, reason) values ($1, $2, $3)`, [
          r.client_id,
          -r.stamps,
          `Troca: ${r.reward}`,
        ]);
      }
      await exec(`update public.loyalty_redemptions set status = $2, decided_at = now() where id = $1`, [
        input.redemptionId,
        input.approve ? "approved" : "rejected",
      ]);
    } else if (input.clientId && input.approve) {
      z.string().uuid().parse(input.clientId);
      await exec(`insert into public.loyalty_transactions (client_id, points, reason) values ($1, $2, $3)`, [
        input.clientId,
        -s.loyalty_stamps_required,
        `Troca no balcão: ${s.loyalty_reward}`,
      ]);
    }
    return { ok: true };
  } catch {
    return fail("A cliente não tem carimbos suficientes.");
  }
}

// =============================================================================
// Assistente
// =============================================================================
export type MgrAssistant = { name: string; greeting: string; instructions: string };

export async function mgrAssistant(): Promise<MgrAssistant> {
  await requireManager();
  const r = await one<{ assistant_name: string; assistant_greeting: string; assistant_instructions: string | null }>(
    `select assistant_name, assistant_greeting, assistant_instructions from public.salon_settings where id = 1`,
  );
  return { name: r?.assistant_name ?? "", greeting: r?.assistant_greeting ?? "", instructions: r?.assistant_instructions ?? "" };
}

export async function mgrSaveAssistant(raw: MgrAssistant): Promise<Result> {
  await requireManager();
  const name = String(raw.name ?? "").trim().slice(0, 40);
  const greeting = String(raw.greeting ?? "").trim().slice(0, 400);
  const instructions = String(raw.instructions ?? "").trim().slice(0, 4000);
  if (name.length < 2 || greeting.length < 5) return fail("Dê um nome e uma mensagem de boas-vindas.");
  await exec(
    `update public.salon_settings set assistant_name = $1, assistant_greeting = $2, assistant_instructions = nullif($3, '') where id = 1`,
    [name, greeting, instructions],
  );
  await translateGreeting();
  siteChanged();
  return { ok: true };
}

// =============================================================================
// Fotos do site (Editar site → Fotos)
// =============================================================================
export type MgrGalleryItem = { id: string; title: string; before: string | null; after: string | null; published: boolean };
export type MgrPhotos = { hero: string | null; about: string | null; gallery: MgrGalleryItem[] };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024;
const mediaId = (url: string | null | undefined) => url?.match(/^\/media\/([0-9a-f-]{36})$/i)?.[1] ?? null;

/** Valida e guarda a imagem; devolve o URL público /media/<id>. */
async function saveMedia(file: unknown, width?: unknown, height?: unknown): Promise<string> {
  if (!(file instanceof File) || file.size === 0) throw new Error("Escolha uma foto.");
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Use uma foto JPG, PNG ou WebP.");
  if (file.size > MAX_BYTES) throw new Error("A foto é demasiado grande (máx. 4 MB).");
  const buf = Buffer.from(await file.arrayBuffer());
  // confirma pelos primeiros bytes que é mesmo uma imagem (não confiar só no tipo declarado)
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw new Error("O ficheiro não é uma imagem válida.");
  const row = await one<{ id: string }>(
    `insert into public.media (mime, data, bytes, width, height) values ($1, $2, $3, $4, $5) returning id`,
    [isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp", buf, buf.length, Number(width) || null, Number(height) || null],
  );
  return `/media/${row!.id}`;
}

async function deleteMedia(...urls: (string | null | undefined)[]) {
  const ids = urls.map(mediaId).filter(Boolean);
  if (ids.length) await exec(`delete from public.media where id = any($1::uuid[])`, [ids]);
}

export async function mgrPhotos(): Promise<MgrPhotos> {
  await requireManager();
  const [s, gallery] = await Promise.all([
    one<{ hero_image_url: string | null; about_image_url: string | null }>(
      `select hero_image_url, about_image_url from public.salon_settings where id = 1`,
    ),
    query<MgrGalleryItem>(
      `select id, coalesce(title, '') as title, before_url as before, after_url as after, published
         from public.gallery_items order by sort_order, created_at`,
    ),
  ]);
  return { hero: s?.hero_image_url ?? null, about: s?.about_image_url ?? null, gallery };
}

/** Troca a foto do topo ("hero") ou da secção "Sobre". */
export async function mgrSetSitePhoto(form: FormData): Promise<Result> {
  await requireManager();
  const slot = z.enum(["hero", "about"]).safeParse(form.get("slot"));
  if (!slot.success) return fail("Foto inválida.");
  const col = slot.data === "hero" ? "hero_image_url" : "about_image_url";
  try {
    const url = await saveMedia(form.get("file"), form.get("width"), form.get("height"));
    const old = await one<{ url: string | null }>(`select ${col} as url from public.salon_settings where id = 1`);
    await exec(`update public.salon_settings set ${col} = $1 where id = 1`, [url]);
    await deleteMedia(old?.url);
    siteChanged();
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Não foi possível guardar a foto.");
  }
}

export async function mgrRemoveSitePhoto(slotRaw: string): Promise<Result> {
  await requireManager();
  const slot = z.enum(["hero", "about"]).parse(slotRaw);
  const col = slot === "hero" ? "hero_image_url" : "about_image_url";
  const old = await one<{ url: string | null }>(`select ${col} as url from public.salon_settings where id = 1`);
  await exec(`update public.salon_settings set ${col} = null where id = 1`);
  await deleteMedia(old?.url);
  siteChanged();
  return { ok: true };
}

/** Novo par antes & depois. */
export async function mgrAddGalleryPair(form: FormData): Promise<Result> {
  await requireManager();
  const title = String(form.get("title") ?? "").trim().slice(0, 60);
  if (!title) return fail("Dê um título (ex.: Madeixas).");
  let before: string | null = null;
  try {
    before = await saveMedia(form.get("before"), form.get("beforeWidth"), form.get("beforeHeight"));
    const after = await saveMedia(form.get("after"), form.get("afterWidth"), form.get("afterHeight"));
    await exec(
      `insert into public.gallery_items (title, before_url, after_url, sort_order)
       values ($1, $2, $3, (select coalesce(max(sort_order), 0) + 10 from public.gallery_items))`,
      [title, before, after],
    );
    siteChanged();
    return { ok: true };
  } catch (e) {
    await deleteMedia(before); // não deixar a 1.ª foto órfã se a 2.ª falhar
    return fail(e instanceof Error ? e.message : "Não foi possível guardar.");
  }
}

export async function mgrDeleteGalleryItem(id: string): Promise<Result> {
  await requireManager();
  z.string().uuid().parse(id);
  const it = await one<{ before_url: string | null; after_url: string }>(
    `delete from public.gallery_items where id = $1 returning before_url, after_url`,
    [id],
  );
  await deleteMedia(it?.before_url, it?.after_url);
  siteChanged();
  return { ok: true };
}

// =============================================================================
// Textos do site (Editar site → Textos do site) + traduções automáticas
// =============================================================================
const TARGETS: Locale[] = ["en", "fr", "es", "de"];

type ContentRow = { content: Partial<SiteContent>; content_i18n: Partial<Record<Locale, Partial<SiteContent>>> };

export type MgrContent = {
  values: SiteContent;
  /** línguas em que faltam traduções de textos alterados */
  missing: Locale[];
  aiReady: boolean;
};

async function contentRow(): Promise<ContentRow> {
  return (await one<ContentRow>(`select content, content_i18n from public.salon_settings where id = 1`)) ?? { content: {}, content_i18n: {} };
}

function missingLocales(row: ContentRow): Locale[] {
  const keys = (Object.keys(row.content) as ContentKey[]).filter((k) => !NEUTRAL_KEYS.includes(k));
  return TARGETS.filter((l) => keys.some((k) => row.content_i18n[l]?.[k] === undefined));
}

export async function mgrContent(): Promise<MgrContent> {
  await requireManager();
  const row = await contentRow();
  return { values: resolveContent("pt", row.content, {}), missing: missingLocales(row), aiReady: !!process.env.OPENAI_API_KEY };
}

/** Traduz as chaves indicadas (ou todas as que faltam) para as 4 línguas. */
async function translateContent(row: ContentRow, only?: ContentKey[]): Promise<ContentRow["content_i18n"]> {
  const i18n = { ...row.content_i18n };
  for (const l of TARGETS) {
    const keys = (Object.keys(row.content) as ContentKey[]).filter(
      (k) => !NEUTRAL_KEYS.includes(k) && (only ? only.includes(k) : i18n[l]?.[k] === undefined),
    );
    if (!keys.length) continue;
    const src = Object.fromEntries(keys.map((k) => [k, row.content[k]]));
    const out = await translateObject(src, l);
    if (out) i18n[l] = { ...(i18n[l] ?? {}), ...out };
  }
  return i18n;
}

/** Guarda os textos (só o que difere do original) e traduz o que mudou. */
export async function mgrSaveContent(values: Partial<SiteContent>): Promise<Result<{ translated: boolean }>> {
  await requireManager();
  const row = await contentRow();
  const next: Partial<SiteContent> = { ...row.content };
  const changed: ContentKey[] = [];
  for (const [k, raw] of Object.entries(values) as [ContentKey, unknown][]) {
    if (!(k in DEFAULT_CONTENT.pt)) continue;
    const v = sanitizeContentValue(k, raw);
    if (v === undefined) continue;
    const isDefault = JSON.stringify(v) === JSON.stringify(DEFAULT_CONTENT.pt[k]);
    const before = JSON.stringify(row.content[k]);
    if (isDefault) delete next[k];
    else (next as Record<string, unknown>)[k] = v;
    if (JSON.stringify(next[k]) !== before) changed.push(k);
  }
  // traduções antigas das chaves alteradas deixam de valer
  const i18n: ContentRow["content_i18n"] = {};
  for (const l of TARGETS) {
    const cur = { ...(row.content_i18n[l] ?? {}) };
    for (const k of changed) delete cur[k];
    i18n[l] = cur;
  }
  await exec(`update public.salon_settings set content = $1, content_i18n = $2 where id = 1`, [next, i18n]);
  const toTranslate = changed.filter((k) => k in next && !NEUTRAL_KEYS.includes(k));
  let translated = true;
  if (toTranslate.length) {
    const done = await translateContent({ content: next, content_i18n: i18n }, toTranslate);
    await exec(`update public.salon_settings set content_i18n = $1 where id = 1`, [done]);
    translated = missingLocales({ content: next, content_i18n: done }).length === 0;
  }
  siteChanged();
  return { ok: true, data: { translated } };
}

/** "Traduzir agora": completa traduções em falta (textos, serviços, galeria, saudação). */
export async function mgrTranslateAll(): Promise<Result<{ missing: Locale[] }>> {
  await requireManager();
  if (!process.env.OPENAI_API_KEY) return fail("Falta a chave da OpenAI.");
  const row = await contentRow();
  const i18n = await translateContent(row);
  await exec(`update public.salon_settings set content_i18n = $1 where id = 1`, [i18n]);
  await translateServices();
  await translateGalleryTitles();
  await translateGreeting();
  siteChanged();
  const missing = missingLocales({ content: row.content, content_i18n: i18n });
  return missing.length ? fail(`Sem resposta da IA para: ${missing.join(", ")} (créditos da OpenAI?)`) : { ok: true, data: { missing } };
}

function sanitizeContentValue(k: ContentKey, raw: unknown): unknown {
  const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const def = DEFAULT_CONTENT.pt[k];
  if (Array.isArray(def)) {
    if (!Array.isArray(raw)) return undefined;
    if (k === "marqueeItems") return raw.map((x) => str(x, 80)).filter(Boolean).slice(0, 12);
    if (k === "aboutStats")
      return raw
        .map((x) => ({ value: str((x as Stat)?.value, 20) ?? "", label: str((x as Stat)?.label, 60) ?? "" }))
        .filter((x) => x.value || x.label)
        .slice(0, 3);
    if (k === "reviews")
      return raw
        .map((x) => ({
          name: str((x as Review)?.name, 40) ?? "",
          rating: Math.max(1, Math.min(5, Math.round(Number((x as Review)?.rating) || 5))),
          text: str((x as Review)?.text, 400) ?? "",
        }))
        .filter((x) => x.name && x.text)
        .slice(0, 6);
    return undefined;
  }
  return str(raw, k === "aboutText" || k === "heroSubtitle" ? 1500 : 300);
}

async function translateServices(ids?: string[]) {
  const rows = await query<{ id: string; name: string; description: string | null; i18n: Partial<Record<Locale, { name?: string; description?: string }>> }>(
    `select id, name, description, i18n from public.services ${ids ? "where id = any($1::uuid[])" : ""}`,
    ids ? [ids] : [],
  );
  for (const r of rows) {
    const i18n = { ...(r.i18n ?? {}) };
    let touched = false;
    for (const l of TARGETS) {
      if (!ids && i18n[l]?.name) continue;
      const out = await translateObject({ name: r.name, description: r.description ?? "" }, l);
      if (out) {
        i18n[l] = { name: out.name, description: out.description || undefined };
        touched = true;
      }
    }
    if (touched) await exec(`update public.services set i18n = $2 where id = $1`, [r.id, i18n]);
  }
}

async function translateGalleryTitles(id?: string) {
  const rows = await query<{ id: string; title: string | null; i18n: Partial<Record<Locale, string>> }>(
    `select id, title, i18n from public.gallery_items ${id ? "where id = $1" : ""}`,
    id ? [id] : [],
  );
  for (const r of rows) {
    if (!r.title) continue;
    const i18n = { ...(r.i18n ?? {}) };
    let touched = false;
    for (const l of TARGETS) {
      if (!id && i18n[l]) continue;
      const out = await translateObject({ title: r.title }, l);
      if (out?.title) {
        i18n[l] = out.title;
        touched = true;
      }
    }
    if (touched) await exec(`update public.gallery_items set i18n = $2 where id = $1`, [r.id, i18n]);
  }
}

async function translateGreeting() {
  const s = await one<{ assistant_greeting: string }>(`select assistant_greeting from public.salon_settings where id = 1`);
  if (!s || s.assistant_greeting === DEFAULT_CONTENT.pt.assistantGreeting) return;
  const row = await contentRow();
  const i18n = { ...row.content_i18n };
  for (const l of TARGETS) {
    const out = await translateObject({ assistantGreeting: s.assistant_greeting }, l);
    if (out) i18n[l] = { ...(i18n[l] ?? {}), assistantGreeting: out.assistantGreeting };
  }
  await exec(`update public.salon_settings set content_i18n = $1 where id = 1`, [i18n]);
}

// -----------------------------------------------------------------------------
// Antes & depois: cada par editável (título, foto do antes, foto do depois)
// -----------------------------------------------------------------------------
export async function mgrAddGalleryItem(title: string): Promise<Result> {
  await requireManager();
  const t = String(title ?? "").trim().slice(0, 60);
  if (!t) return fail("Dê um título (ex.: Madeixas).");
  const row = await one<{ id: string }>(
    `insert into public.gallery_items (title, sort_order)
     values ($1, (select coalesce(max(sort_order), 0) + 10 from public.gallery_items)) returning id`,
    [t],
  );
  if (row) await translateGalleryTitles(row.id);
  siteChanged();
  return { ok: true };
}

/** Atualiza um par: form com id e, opcionalmente, title / before / after (+ width/height). */
export async function mgrUpdateGalleryItem(form: FormData): Promise<Result> {
  await requireManager();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return fail("Par inválido.");
  const cur = await one<{ title: string | null; before_url: string | null; after_url: string | null }>(
    `select title, before_url, after_url from public.gallery_items where id = $1`,
    [id.data],
  );
  if (!cur) return fail("Par não encontrado.");
  try {
    const title = form.get("title");
    if (typeof title === "string" && title.trim() && title.trim() !== cur.title) {
      await exec(`update public.gallery_items set title = $2, i18n = '{}' where id = $1`, [id.data, title.trim().slice(0, 60)]);
      await translateGalleryTitles(id.data);
    }
    for (const side of ["before", "after"] as const) {
      const file = form.get(side);
      if (file instanceof File && file.size > 0) {
        const url = await saveMedia(file, form.get(`${side}Width`), form.get(`${side}Height`));
        await exec(`update public.gallery_items set ${side}_url = $2 where id = $1`, [id.data, url]);
        await deleteMedia(side === "before" ? cur.before_url : cur.after_url);
      }
    }
    siteChanged();
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Não foi possível guardar.");
  }
}

// -----------------------------------------------------------------------------
// Equipa no site (foto, cargo, redes) — Editar site → Equipa
// -----------------------------------------------------------------------------
const socialUrl = z.union([z.literal(""), z.string().trim().url().max(300)]);

/** Atualiza a apresentação de uma profissional. form: id, name, job_title, instagram, facebook, tiktok, team_order, photo? */
export async function mgrSaveStaffProfile(form: FormData): Promise<Result> {
  await requireManager();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return fail("Profissional inválida.");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) return fail("Escreva o nome.");
  const jobTitle = String(form.get("job_title") ?? "").trim().slice(0, 80);
  const urls = {
    instagram: socialUrl.safeParse(String(form.get("instagram") ?? "")),
    facebook: socialUrl.safeParse(String(form.get("facebook") ?? "")),
    tiktok: socialUrl.safeParse(String(form.get("tiktok") ?? "")),
  };
  for (const [k, r] of Object.entries(urls)) if (!r.success) return fail(`Link do ${k} inválido (comece por https://).`);
  const socials = Object.fromEntries(Object.entries(urls).filter(([, r]) => r.success && r.data).map(([k, r]) => [k, (r as { data: string }).data]));
  const order = Math.max(0, Math.min(99, Number(form.get("team_order")) || 0));

  const cur = await one<{ avatar_url: string | null; job_title: string | null }>(
    `select avatar_url, job_title from public.profiles where id = $1 and role in ('staff', 'admin')`,
    [id.data],
  );
  if (!cur) return fail("Profissional não encontrada.");
  try {
    let avatar = cur.avatar_url;
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      avatar = await saveMedia(photo, form.get("photoWidth"), form.get("photoHeight"));
      await deleteMedia(cur.avatar_url);
    } else if (form.get("removePhoto") === "1") {
      await deleteMedia(cur.avatar_url);
      avatar = null;
    }
    const titleChanged = jobTitle !== (cur.job_title ?? "");
    await exec(
      `update public.profiles set name = $2, job_title = nullif($3, ''), socials = $4, team_order = $5, avatar_url = $6
              ${titleChanged ? ", i18n = '{}'" : ""}
        where id = $1`,
      [id.data, name, jobTitle, socials, order, avatar],
    );
    // cargo nas outras línguas
    if (titleChanged && jobTitle) {
      const i18n: Record<string, { job_title: string }> = {};
      for (const l of TARGETS) {
        const out = await translateObject({ job_title: jobTitle }, l);
        if (out?.job_title) i18n[l] = { job_title: out.job_title };
      }
      if (Object.keys(i18n).length) await exec(`update public.profiles set i18n = $2 where id = $1`, [id.data, i18n]);
    }
    siteChanged();
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Não foi possível guardar.");
  }
}

// -----------------------------------------------------------------------------
// Marcas de produtos (faixa de logótipos) — Editar site → Marcas
// -----------------------------------------------------------------------------
export type MgrBrand = { id: string; name: string; logo: string; w: number; h: number };

async function readBrands(): Promise<MgrBrand[]> {
  const s = await one<{ brands: MgrBrand[] | null }>(`select brands from public.salon_settings where id = 1`);
  return s?.brands ?? [];
}

async function writeBrands(list: MgrBrand[]) {
  await exec(`update public.salon_settings set brands = $1 where id = 1`, [JSON.stringify(list)]);
  siteChanged();
}

export async function mgrBrands(): Promise<MgrBrand[]> {
  await requireManager();
  return readBrands();
}

/** Nova marca. form: name, logo (PNG/WebP com transparência), logoWidth, logoHeight */
export async function mgrAddBrand(form: FormData): Promise<Result> {
  await requireManager();
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (name.length < 2) return fail("Escreva o nome da marca.");
  const w = Number(form.get("logoWidth"));
  const h = Number(form.get("logoHeight"));
  if (!(w > 0 && h > 0)) return fail("Escolha o logótipo.");
  const list = await readBrands();
  if (list.length >= 30) return fail("Máximo de 30 marcas.");
  try {
    const logo = await saveMedia(form.get("logo"), w, h);
    await writeBrands([...list, { id: crypto.randomUUID(), name, logo, w, h }]);
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Não foi possível guardar o logótipo.");
  }
}

export async function mgrDeleteBrand(id: string): Promise<Result> {
  await requireManager();
  const list = await readBrands();
  const b = list.find((x) => x.id === id);
  if (!b) return fail("Marca não encontrada.");
  await writeBrands(list.filter((x) => x.id !== id));
  await deleteMedia(b.logo);
  return { ok: true };
}

/** Muda a posição na faixa (-1 = para a esquerda, 1 = para a direita). */
export async function mgrMoveBrand(id: string, dir: number): Promise<Result> {
  await requireManager();
  const list = await readBrands();
  const i = list.findIndex((x) => x.id === id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await writeBrands(list);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Widget da agenda no ecrã inicial (Instalar App → Widget)
// -----------------------------------------------------------------------------
export type MgrWidgetKey = { id: string; label: string; created_at: string; last_used_at: string | null };

export async function mgrWidgetKeys(): Promise<MgrWidgetKey[]> {
  await requireManager();
  return query<MgrWidgetKey>(`select id, label, created_at, last_used_at from public.widget_tokens order by created_at desc`);
}

/** Cria uma chave para um telemóvel; a chave em claro só é devolvida agora (guarda-se o hash). */
export async function mgrCreateWidgetKey(labelRaw: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  await requireManager();
  const label = String(labelRaw ?? "").trim().slice(0, 60);
  if (!label) return { ok: false, error: "Dê um nome ao telemóvel (ex.: iPhone da Claudia)." };
  const count = await one<{ n: number }>(`select count(*)::int as n from public.widget_tokens`);
  if ((count?.n ?? 0) >= 20) return { ok: false, error: "Máximo de 20 widgets. Revogue algum antigo." };
  const token = newWidgetToken();
  await exec(`insert into public.widget_tokens (label, token_hash) values ($1, $2)`, [label, hashWidgetToken(token)]);
  return { ok: true, token };
}

export async function mgrRevokeWidgetKey(id: string): Promise<Result> {
  await requireManager();
  z.string().uuid().parse(id);
  await exec(`delete from public.widget_tokens where id = $1`, [id]);
  return { ok: true };
}

/** Pré-visualização do que o widget mostra agora. */
export async function mgrWidgetPreview(): Promise<WidgetAgenda> {
  await requireManager();
  return getWidgetAgenda();
}
