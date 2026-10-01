import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { one, query } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { open } from "@/lib/secret-box";

// =============================================================================
// WhatsApp — confirmação de marcações.
//
// Sem credenciais (funciona já): o cliente recebe um botão wa.me com
// "CONFIRMAR #CÓDIGO" escrito → envia ao salão → o salão confirma no painel.
//
// Com o WhatsApp Business da Meta (painel → Automação: Phone Number ID + Access
// Token): o salão envia o pedido de confirmação e o webhook confirma/cancela
// sozinho quando o cliente responde SIM/NÃO.
// ATENÇÃO: a Meta só deixa enviar texto livre a quem escreveu nas últimas 24 h.
// Para escrever primeiro (pedido de confirmação, lembrete) é preciso um modelo
// (template) aprovado — ver sendTemplate quando for criado no Meta Business.
// =============================================================================

export type IncomingMessage = { id: string; from: string; text: string };

type Secrets = {
  whatsapp_phone_number_id: string | null;
  whatsapp_access_token: string | null;
  whatsapp_app_secret: string | null;
  whatsapp_verify_token: string | null;
};

const GRAPH = "https://graph.facebook.com/v21.0";

async function secrets(): Promise<Secrets | null> {
  const s = await one<Secrets>(
    `select whatsapp_phone_number_id, whatsapp_access_token, whatsapp_app_secret, whatsapp_verify_token
       from public.integration_secrets where id = 1`,
  );
  return s && {
    whatsapp_phone_number_id: s.whatsapp_phone_number_id,
    whatsapp_access_token: open(s.whatsapp_access_token),
    whatsapp_app_secret: open(s.whatsapp_app_secret),
    whatsapp_verify_token: open(s.whatsapp_verify_token),
  };
}

export async function whatsappReady(): Promise<boolean> {
  const s = await secrets();
  return Boolean(s?.whatsapp_phone_number_id && s.whatsapp_access_token);
}

export async function sendWhatsApp(toE164: string, text: string): Promise<boolean> {
  const s = await secrets();
  if (!s?.whatsapp_phone_number_id || !s.whatsapp_access_token) return false;
  try {
    const res = await fetch(`${GRAPH}/${s.whatsapp_phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.whatsapp_access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164.replace(/\D/g, ""),
        type: "text",
        text: { body: text, preview_url: false },
      }),
    });
    if (!res.ok) console.error("[whatsapp] envio falhou", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("[whatsapp]", e);
    return false;
  }
}

/** Verificação GET do webhook (hub.challenge). */
export async function verifyWebhookChallenge(params: URLSearchParams): Promise<string | null> {
  const s = await secrets();
  if (params.get("hub.mode") !== "subscribe" || !s?.whatsapp_verify_token) return null;
  return params.get("hub.verify_token") === s.whatsapp_verify_token ? params.get("hub.challenge") : null;
}

/** Valida X-Hub-Signature-256 com o App Secret. */
export async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  const s = await secrets();
  if (!s?.whatsapp_app_secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", s.whatsapp_app_secret).update(rawBody).digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Mensagens de texto recebidas no payload do webhook da Meta. */
export function parseIncoming(rawBody: string): IncomingMessage[] {
  try {
    const body = JSON.parse(rawBody) as {
      entry?: { changes?: { value?: { messages?: { id: string; from: string; type: string; text?: { body: string } }[] } }[] }[];
    };
    return (body.entry ?? [])
      .flatMap((e) => e.changes ?? [])
      .flatMap((c) => c.value?.messages ?? [])
      .filter((m) => m.type === "text" && m.text?.body)
      .map((m) => ({ id: m.id, from: `+${m.from}`, text: m.text!.body }));
  } catch {
    return [];
  }
}

// -----------------------------------------------------------------------------
type ConfirmableAppointment = { code: string; start_time: string; services: { name: string } | null };

function describe(ap: ConfirmableAppointment, tz: string) {
  const when = new Intl.DateTimeFormat("pt-PT", { dateStyle: "full", timeStyle: "short", timeZone: tz }).format(new Date(ap.start_time));
  return `${ap.services?.name ?? "Marcação"} · ${when}`;
}

/** Mensagem que o cliente envia ao salão para confirmar (botão wa.me). */
export function clientConfirmMessage(ap: ConfirmableAppointment, clientName: string, tz: string) {
  return `Olá! Sou ${clientName} e quero CONFIRMAR a marcação #${ap.code} (${describe(ap, tz)}).`;
}

/** Envia ao cliente o pedido de confirmação. Sem credenciais não faz nada. */
export async function requestConfirmation(appointmentId: string): Promise<boolean> {
  if (!(await whatsappReady())) return false;
  const ap = await one<{
    code: string;
    status: string;
    start_time: string;
    service: string;
    name: string | null;
    phone: string | null;
    salon: string;
    timezone: string;
  }>(
    `select a.code, a.status, a.start_time, sv.name as service,
            coalesce(p.name, a.guest_name) as name, coalesce(p.phone, a.guest_phone) as phone,
            s.name as salon, s.timezone
       from public.appointments a
       join public.services sv on sv.id = a.service_id
       left join public.profiles p on p.id = a.client_id
       cross join public.salon_settings s
      where a.id = $1`,
    [appointmentId],
  );
  if (!ap || ap.status !== "pending" || !ap.phone) return false;

  const sent = await sendWhatsApp(
    ap.phone,
    `Olá ${(ap.name ?? "").split(" ")[0]}! Recebemos o seu pedido no ${ap.salon}:\n` +
      `${describe({ code: ap.code, start_time: ap.start_time, services: { name: ap.service } }, ap.timezone)}\n\n` +
      `Responda *SIM* para confirmar ou *NÃO* para cancelar. (#${ap.code})`,
  );
  if (sent) await query(`update public.appointments set confirmation_sent_at = now() where id = $1`, [appointmentId]);
  return sent;
}

const CODE = /#?\b([0-9A-F]{8})\b/i;
const YES = /^\s*(sim|confirmo|confirmar|confirmado|yes)(?!\p{L})|confirmar a marca/iu;
const NO = /^\s*(n[aã]o|cancelar|cancela|cancelo)(?!\p{L})/iu;

/**
 * Trata respostas de confirmação. Devolve a resposta a enviar ao cliente, ou
 * null se a mensagem não for sobre confirmação (aí segue para a IA).
 * Só mexe em marcações cujo telefone coincide com o remetente.
 */
export async function handleIncomingText(fromRaw: string, text: string): Promise<string | null> {
  // "sim"/"não" soltos só contam em mensagens curtas ("não, prefiro sábado" segue para a IA)
  const short = text.trim().length <= 25 || CODE.test(text);
  const wantsYes = short && YES.test(text);
  const wantsNo = short && !wantsYes && NO.test(text);
  if (!wantsYes && !wantsNo) return null;

  const from = normalizePhone(fromRaw);
  if (!from) return null;
  const code = text.match(CODE)?.[1]?.toUpperCase() ?? null;

  const ap = await one<{ id: string; code: string; start_time: string; service: string; timezone: string }>(
    `select a.id, a.code, a.start_time, sv.name as service, s.timezone
       from public.appointments a
       join public.services sv on sv.id = a.service_id
       left join public.profiles p on p.id = a.client_id
       cross join public.salon_settings s
      where a.status = 'pending' and a.start_time >= now()
        and (p.phone = $1 or a.guest_phone = $1)
        and ($2::text is null or a.code = $2)
      order by a.start_time
      limit 1`,
    [from, code],
  );
  if (!ap) {
    return code
      ? `Não encontrámos uma marcação pendente #${code} para este número. Se marcou com outro contacto, o salão vai confirmar consigo.`
      : null;
  }
  const desc = describe({ code: ap.code, start_time: ap.start_time, services: { name: ap.service } }, ap.timezone);

  if (wantsYes) {
    await query(`update public.appointments set status = 'confirmed' where id = $1 and status = 'pending'`, [ap.id]);
    return `Marcação confirmada ✅\n${desc}\nAté breve!`;
  }
  await query(
    `update public.appointments set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Cancelado pelo cliente via WhatsApp'
      where id = $1 and status = 'pending'`,
    [ap.id],
  );
  return `Marcação cancelada.\n${desc}\nQuando quiser, marque de novo por aqui.`;
}
