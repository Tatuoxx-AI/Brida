import "server-only";
import { dbErrorMessage, one, query } from "@/lib/db";
import { clientConfirmMessage, requestConfirmation } from "@/lib/whatsapp";
import { notifyTelegram } from "@/lib/notify";
import { pushToManagers } from "@/lib/push";
import { whatsappLink } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { BOOKING_ERROR_MESSAGES, type AppointmentRow, type AppointmentSource, type BookingErrorCode } from "@/types/database";

// Criação de marcações pelo cliente, partilhada pela agenda do site e pela IA.
// As regras (horário, sobreposição, desconto) vivem em book_appointment (SQL).

export type BookingSummary = {
  id: string;
  code: string;
  services: string[];
  startTime: string;
  when: string;
  staffName: string;
  total: number;
  discount: number;
  status: "pending" | "confirmed";
  /** wa.me para o salão com "CONFIRMAR #código" já escrito (null se confirmada) */
  confirmUrl: string | null;
  /** true quando o pedido de confirmação já foi enviado pela API do WhatsApp */
  confirmationSent: boolean;
};

export type BookingResult =
  | { ok: true; booking: BookingSummary; clientId: string; verified: boolean }
  | { ok: false; error: string; code: BookingErrorCode | "INVALID_PHONE" | "UNKNOWN" };

export function bookingError(message: string): Extract<BookingResult, { ok: false }> {
  const code = Object.keys(BOOKING_ERROR_MESSAGES).find((c) => message.includes(c)) as BookingErrorCode | undefined;
  if (!code) console.error("[booking]", message);
  return { ok: false, error: code ? BOOKING_ERROR_MESSAGES[code] : "Não foi possível concluir a marcação.", code: code ?? "UNKNOWN" };
}

/** Ficha do cliente: sessão do site > telefone já conhecido > ficha nova. */
export async function resolveClient(
  name: string,
  rawPhone: string,
  opts: { profileId?: string | null; knownPhone?: string | null; email?: string | null; birthDate?: string | null },
): Promise<{ ok: true; id: string; verified: boolean } | { ok: false; error: string }> {
  if (opts.profileId) {
    await completeProfile(opts.profileId, opts.email, opts.birthDate);
    return { ok: true, id: opts.profileId, verified: true };
  }
  const phone = normalizePhone(opts.knownPhone ?? rawPhone);
  if (!phone) return { ok: false, error: "Telemóvel inválido. Ex.: 912 345 678 ou +351 912 345 678." };

  // insere se não existir; se já existir (índice único do telefone) devolve a ficha
  const row = await one<{ id: string; created: boolean; email: string | null; birth_date: string | null }>(
    `with ins as (
       insert into public.profiles (name, phone, role) values ($1, $2, 'client')
       on conflict (phone) where phone is not null do nothing
       returning id
     )
     select id, true as created, null::text as email, null::text as birth_date from ins
     union all
     select id, false, email, birth_date::text from public.profiles where phone = $2
     limit 1`,
    [name.trim(), phone],
  );
  if (!row) return { ok: false, error: "Não foi possível registar o contacto." };
  // Ficha nova → é desta pessoa. Ficha que já existia → só se o email E o aniversário
  // coincidirem (para ninguém ver os dados de outra pessoa só por saber o telemóvel).
  const sameEmail = !!row.email && !!opts.email && row.email.toLowerCase() === opts.email.trim().toLowerCase();
  const sameBirth = !!row.birth_date && row.birth_date === opts.birthDate;
  const verified = row.created || (sameEmail && sameBirth);
  await completeProfile(row.id, opts.email, opts.birthDate);
  return { ok: true, id: row.id, verified };
}

/**
 * Guarda email e aniversário na ficha se ainda estiverem em branco (nunca
 * sobrescreve o que o salão já tem). Um email já usado por outra ficha é ignorado.
 */
async function completeProfile(id: string, email?: string | null, birthDate?: string | null) {
  if (!email && !birthDate) return;
  await query(
    `update public.profiles p
        set email = case when p.email is null and $2::text is not null
                          and not exists (select 1 from public.profiles o where lower(o.email) = lower($2) and o.id <> p.id)
                         then $2 else p.email end,
            birth_date = coalesce(p.birth_date, $3::date)
      where p.id = $1`,
    [id, email?.trim().toLowerCase() || null, birthDate || null],
  );
}

export async function createBooking(input: {
  serviceIds: string[];
  start: string;
  staffId?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  source: AppointmentSource;
  profileId?: string | null;
  knownPhone?: string | null;
  /** formato da data devolvida ao cliente (ex.: "en-GB") */
  intl?: string;
}): Promise<BookingResult> {
  const client = await resolveClient(input.name, input.phone, input);
  if (!client.ok) return { ok: false, error: client.error, code: "INVALID_PHONE" };

  let ap: AppointmentRow | null;
  try {
    ap = await one<AppointmentRow>(
      `select * from public.book_appointment($1::uuid[], $2::timestamptz, $3::uuid, $4::uuid, null, null, $5::public.appointment_source, $6)`,
      [input.serviceIds, input.start, input.staffId ?? null, client.id, input.source, input.notes ?? null],
    );
  } catch (e) {
    return bookingError(dbErrorMessage(e));
  }
  if (!ap) return bookingError("");

  // Na conversa de WhatsApp o número já está provado e o cliente confirmou ali.
  let status: "pending" | "confirmed" = ap.status === "confirmed" ? "confirmed" : "pending";
  if (status === "pending" && input.source === "whatsapp") {
    await query(`update public.appointments set status = 'confirmed' where id = $1 and status = 'pending'`, [ap.id]);
    status = "confirmed";
  }

  const [staff, services, settings] = await Promise.all([
    one<{ name: string }>(`select name from public.profiles where id = $1`, [ap.staff_id]),
    query<{ id: string; name: string }>(`select id, name from public.services where id = any($1::uuid[])`, [input.serviceIds]),
    one<{ whatsapp: string | null; timezone: string; auto_confirm_whatsapp: boolean; telegram_notify: boolean }>(
      `select whatsapp, timezone, auto_confirm_whatsapp, telegram_notify from public.salon_settings where id = 1`,
    ),
  ]);
  const tz = settings?.timezone ?? "Europe/Lisbon";
  const names = input.serviceIds.map((id) => services.find((s) => s.id === id)?.name ?? "Serviço");
  const when = new Intl.DateTimeFormat(input.intl ?? "pt-PT", { dateStyle: "full", timeStyle: "short", timeZone: tz }).format(new Date(ap.start_time));
  const whenPt = new Intl.DateTimeFormat("pt-PT", { dateStyle: "full", timeStyle: "short", timeZone: tz }).format(new Date(ap.start_time));

  const confirmationSent = status === "pending" && settings?.auto_confirm_whatsapp ? await requestConfirmation(ap.id) : false;
  const confirmUrl =
    status === "pending" && settings?.whatsapp
      ? whatsappLink(
          settings.whatsapp,
          clientConfirmMessage({ code: ap.code, start_time: ap.start_time, services: { name: names.join(" + ") } }, input.name, tz),
        )
      : null;

  // aviso no telemóvel da dona (painel instalado), mesmo com a app fechada
  void pushToManagers({
    title: status === "pending" ? "Nova marcação · por confirmar" : "Nova marcação",
    body: `${input.name} · ${names.join(" + ")}
${whenPt}`,
    tag: `ap-${ap.id}`,
  });

  if (settings?.telegram_notify) {
    void notifyTelegram(
      `🗓 Nova marcação${status === "pending" ? " (por confirmar)" : ""}\n${input.name} · ${input.phone}\n${names.join(" + ")}\n${whenPt}\n#${ap.code}`,
    );
  }

  return {
    ok: true,
    clientId: client.id,
    verified: client.verified,
    booking: {
      id: ap.id,
      code: ap.code,
      services: names,
      startTime: ap.start_time,
      when,
      staffName: staff?.name ?? "",
      total: Number(ap.total_price),
      discount: Number(ap.discount_amount),
      status,
      confirmUrl,
      confirmationSent,
    },
  };
}
