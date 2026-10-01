import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { exec, one, query } from "@/lib/db";
import { sendWhatsApp, whatsappReady } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Automações agendadas (painel → Automação): lembrete 24 h antes e aniversários.
 * Chamar de hora a hora com o cabeçalho  Authorization: Bearer <CRON_SECRET>
 * (na Vercel: vercel.json → crons; ela envia o CRON_SECRET sozinha).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const s = await one<{ reminder_24h: boolean; birthday_message: boolean; name: string; timezone: string }>(
    `select reminder_24h, birthday_message, name, timezone from public.salon_settings where id = 1`,
  );
  if (!s || !(await whatsappReady())) return NextResponse.json({ ok: true, skipped: "whatsapp não configurado" });

  let reminders = 0;
  let birthdays = 0;

  if (s.reminder_24h) {
    const due = await query<{ id: string; phone: string; name: string; service: string; start_time: string }>(
      `select a.id, coalesce(p.phone, a.guest_phone) as phone, split_part(coalesce(p.name, a.guest_name), ' ', 1) as name,
              sv.name as service, a.start_time
         from public.appointments a
         left join public.profiles p on p.id = a.client_id
         join public.services sv on sv.id = a.service_id
        where a.status = 'confirmed' and a.reminder_sent_at is null
          and a.start_time between now() + interval '20 hours' and now() + interval '26 hours'
          and coalesce(p.phone, a.guest_phone) is not null`,
    );
    for (const a of due) {
      const when = new Intl.DateTimeFormat("pt-PT", { weekday: "long", hour: "2-digit", minute: "2-digit", timeZone: s.timezone }).format(new Date(a.start_time));
      if (await sendWhatsApp(a.phone, `Olá ${a.name}! Lembrete do ${s.name}: ${a.service} amanhã, ${when}. Até já! ✨`)) {
        await exec(`update public.appointments set reminder_sent_at = now() where id = $1`, [a.id]);
        reminders++;
      }
    }
  }

  if (s.birthday_message) {
    const today = await query<{ id: string; phone: string; name: string }>(
      `select id, phone, split_part(name, ' ', 1) as name from public.profiles
        where role = 'client' and phone is not null and birth_date is not null
          and to_char(birth_date, 'MM-DD') = to_char(now() at time zone $1, 'MM-DD')
          and coalesce(birthday_sent_year, 0) < extract(year from now() at time zone $1)`,
      [s.timezone],
    );
    for (const c of today) {
      if (await sendWhatsApp(c.phone, `Parabéns, ${c.name}! 🎉 Toda a equipa do ${s.name} deseja-lhe um dia maravilhoso.`)) {
        await exec(`update public.profiles set birthday_sent_year = extract(year from now() at time zone $2) where id = $1`, [c.id, s.timezone]);
        birthdays++;
      }
    }
  }

  return NextResponse.json({ ok: true, reminders, birthdays });
}
