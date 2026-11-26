import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { dbErrorMessage, one, query } from "@/lib/db";
import { bookingError, createBooking } from "@/lib/booking";
import { getWeekSlots } from "@/actions/agenda";
import { normalizePhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { notifyTelegram } from "@/lib/notify";
import { pushToManagers } from "@/lib/push";

/**
 * API para a central de agentes de WhatsApp (OpenWA + Claude).
 *
 * Autenticação, em todos os pedidos (a chave NUNCA viaja no pedido):
 *   X-Cliente-Telefone: <telefone do WhatsApp que está a falar>
 *   X-Agente-Ts:        <segundos desde 1970>
 *   X-Agente-Assinatura: hex(HMAC-SHA256(AGENT_API_KEY,
 *                          ts \n MÉTODO \n caminho?query \n telefone \n sha256hex(corpo)))
 *
 * Pedidos com mais de 60 s de diferença são recusados (um pedido capturado não
 * serve depois). Proteção extra recomendada: firewall do Vercel a aceitar
 * /api/agente/* só do IP da VPS da central.
 *
 * O telefone é a identidade da cliente: só se listam, alteram e cancelam as
 * marcações da ficha com esse telefone. Quem chama é a central, que o tira do
 * próprio WhatsApp — nunca do texto da conversa.
 */

const TZ = "Europe/Lisbon";
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const MAX_SKEW_SEC = 60;
const MAX_BODY = 16 * 1024;
/** marcações futuras ativas por cliente feitas/geridas pelo WhatsApp (evita esgotar a agenda) */
export const MAX_ACTIVE_PER_CLIENT = 3;

export type AgentCtx = { phone: string };
export type AgentRequest = { ctx: AgentCtx; body: unknown };

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Caminho + query numa forma única (descodificada, parâmetros ordenados), para a
 * assinatura não depender de como cada lado codifica acentos, espaços ou aspas.
 * Tem de ser igual a canonicalTarget() em src/connectors/brida.ts da central.
 */
export function canonicalTarget(url: URL): string {
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* fica como veio */
  }
  const q = [...url.searchParams.entries()]
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return q ? `${path}?${q}` : path;
}

/** O que a central assina (tem de ser igual ao src/connectors/brida.ts da central). */
export function agentSignature(key: string, ts: string, method: string, target: string, phone: string, body: string) {
  return createHmac("sha256", key).update([ts, method.toUpperCase(), target, phone, sha256hex(body)].join("\n")).digest("hex");
}

/** Valida assinatura, hora e telefone e lê o corpo. Devolve o pedido ou a resposta de erro. */
export async function agentRequest(req: Request): Promise<AgentRequest | Response> {
  const key = process.env.AGENT_API_KEY ?? "";
  // em produção a chave tem de ter pelo menos 32 caracteres; em dev aceita qualquer uma (ex.: "dev")
  const strongEnough = process.env.NODE_ENV === "production" ? key.length >= 32 : key.length > 0;
  if (!strongEnough) {
    return json({ ok: false, code: "AGENT_DISABLED", error: "Agente desligado (AGENT_API_KEY em falta ou curta)." }, 503);
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const unauthorized = () => json({ ok: false, code: "UNAUTHORIZED", error: "Pedido não autorizado." }, 401);
  // limite por IP (por instância — no Vercel, para um limite global use o firewall/WAF do projeto)
  if (!rateLimit(`agente-ip:${ip}`, 300, 10 * 60_000)) return json({ ok: false, code: "RATE_LIMIT", error: "Demasiados pedidos." }, 429);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, code: "INVALID", error: "Corpo grande demais." }, 413);

  const ts = req.headers.get("x-agente-ts") ?? "";
  const sig = (req.headers.get("x-agente-assinatura") ?? "").toLowerCase();
  const rawPhone = req.headers.get("x-cliente-telefone") ?? "";
  if (!/^\d{9,11}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_SEC || !/^[0-9a-f]{64}$/.test(sig)) {
    return unauthorized();
  }
  const expected = agentSignature(key, ts, req.method, canonicalTarget(new URL(req.url)), rawPhone, raw);
  if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return unauthorized();

  const phone = normalizePhone(rawPhone);
  if (!phone) return json({ ok: false, code: "INVALID_PHONE", error: "Telefone da cliente em falta ou inválido." }, 400);
  if (!rateLimit(`agente:${phone}`, 60, 10 * 60_000)) {
    return json({ ok: false, code: "RATE_LIMIT", error: "Demasiados pedidos seguidos." }, 429);
  }
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, code: "INVALID", error: "JSON inválido." }, 400);
    }
  }
  return { ctx: { phone }, body };
}

/** Texto escolhido pela cliente/modelo que vai para avisos da equipa: uma linha só, sem forjar linhas. */
const oneLine = (s: string) => s.replace(/[\r\n\u2028\u2029]+/g, " ").trim();

const ERROR_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  PERMISSION_DENIED: 404, // nunca revelar que a marcação existe e é de outra pessoa
  SLOT_UNAVAILABLE: 409,
  INVALID_STATUS: 409,
  CANCELLATION_WINDOW: 409,
  INVALID_SERVICES: 400,
  CLIENT_REQUIRED: 400,
  INVALID_PHONE: 400,
};

const NOT_FOUND = { ok: false, code: "NOT_FOUND", error: "Marcação não encontrada para este número." };

function fail(e: unknown) {
  const r = bookingError(dbErrorMessage(e));
  if (r.code === "PERMISSION_DENIED" || r.code === "NOT_FOUND") return json(NOT_FOUND, 404);
  return json({ ok: false, code: r.code, error: r.error }, ERROR_STATUS[r.code] ?? 500);
}

export function badRequest(err: z.ZodError) {
  return json({ ok: false, code: "INVALID", error: err.issues[0]?.message ?? "Dados inválidos." }, 400);
}

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat("pt-PT", { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(new Date(iso));

async function clientIdByPhone(phone: string): Promise<string | null> {
  return (await one<{ id: string }>(`select id from public.profiles where phone = $1`, [phone]))?.id ?? null;
}

// ---------------------------------------------------------------- informação

export async function getInfo() {
  const [settings, services, staff, hours] = await Promise.all([
    one<Record<string, unknown>>(
      `select name, tagline, about, phone, whatsapp, email, address, area, timezone, currency,
              min_lead_minutes, booking_horizon_days, cancellation_window_hours,
              assistant_name, assistant_instructions, loyalty_stamps_required, loyalty_reward
         from public.salon_settings where id = 1`,
    ),
    query(
      `select id, name, description, category, duration_minutes, price, is_addon
         from public.services where active order by is_addon, sort_order, name`,
    ),
    query(`select id, name, job_title, service_ids from public.public_staff order by team_order nulls last, name`),
    query(
      `select weekday, to_char(opens_at, 'HH24:MI') as opens_at, to_char(closes_at, 'HH24:MI') as closes_at, is_closed
         from public.business_hours order by weekday`,
    ),
  ]);
  // sem "agora": a central guarda isto em cache; a hora certa vai no contexto de cada mensagem
  return { ok: true, salao: settings, servicos: services, profissionais: staff, horario: hours };
}

/** AAAA-MM-DD que existe mesmo no calendário (2026-02-31 não passa). */
const realDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser AAAA-MM-DD")
  .refine((d) => new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d, "data inexistente");

// ---------------------------------------------------------------- disponibilidade

export const AvailabilityQuery = z.object({
  data: realDate,
  servicos: z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid("serviço inválido")).min(1, "indique pelo menos um serviço").max(5)),
  profissional: z.string().uuid().optional(),
  dias: z.coerce.number().int().min(1).max(7).default(3),
});

export async function getAvailability(q: z.infer<typeof AvailabilityQuery>) {
  const days = await getWeekSlots(q.data, q.dias, q.servicos, q.profissional ?? null);
  return {
    ok: true,
    dias: days.map((d) => ({
      data: d.date,
      fechado: d.closed,
      horarios: d.slots.map((s) => ({ inicio: s.start, hora: s.time, desconto: s.discount, profissionais: s.staffIds })),
    })),
  };
}

// ---------------------------------------------------------------- marcações

export async function listAppointments(ctx: AgentCtx) {
  const clientId = await clientIdByPhone(ctx.phone);
  if (!clientId) return { ok: true, marcacoes: [] };
  const rows = await query<{ code: string; start_time: string; status: string; services: string; staff_name: string; total_price: number }>(
    `select * from public.agent_client_appointments($1)`,
    [clientId],
  );
  return {
    ok: true,
    marcacoes: rows.map((r) => ({
      codigo: r.code,
      inicio: r.start_time,
      quando: fmtWhen(r.start_time),
      estado: r.status,
      servicos: r.services,
      profissional: r.staff_name,
      total: Number(r.total_price),
    })),
  };
}

export const CreateBody = z.object({
  servicos: z.array(z.string().uuid("serviço inválido")).min(1).max(5),
  inicio: z.string().datetime({ offset: true, message: "inicio deve ser data/hora ISO 8601" }),
  profissional: z.string().uuid().nullable().optional(),
  nome: z.string().max(80).transform(oneLine).pipe(z.string().min(2, "Falta o nome da cliente.")),
  notas: z.string().max(500).transform(oneLine).optional(),
});

export async function createAppointment(ctx: AgentCtx, body: z.infer<typeof CreateBody>) {
  // teto de marcações futuras por número: um número (ou um modelo enganado) não esgota a agenda
  const clientId = await clientIdByPhone(ctx.phone);
  if (clientId) {
    const active = await query(`select 1 from public.agent_client_appointments($1)`, [clientId]);
    if (active.length >= MAX_ACTIVE_PER_CLIENT) {
      return json(
        {
          ok: false,
          code: "TOO_MANY_ACTIVE",
          error: `Este número já tem ${active.length} marcações futuras. Para marcar mais, fale com a equipa do salão.`,
        },
        409,
      );
    }
  }
  const r = await createBooking({
    serviceIds: body.servicos,
    start: body.inicio,
    staffId: body.profissional ?? null,
    name: body.nome,
    phone: ctx.phone, // sempre o do WhatsApp, nunca um telefone escrito na conversa
    notes: body.notas ?? null,
    source: "whatsapp",
  });
  if (!r.ok) return json({ ok: false, code: r.code, error: r.error }, ERROR_STATUS[r.code] ?? 500);
  const b = r.booking;
  return json(
    {
      ok: true,
      marcacao: {
        codigo: b.code,
        inicio: b.startTime,
        quando: b.when,
        estado: b.status,
        servicos: b.services.join(" + "),
        profissional: b.staffName,
        total: b.total,
        desconto: b.discount,
      },
    },
    201,
  );
}

export const RescheduleBody = z.object({
  inicio: z.string().datetime({ offset: true, message: "inicio deve ser data/hora ISO 8601" }),
});

const CodeParam = z.string().trim().regex(/^#?[0-9A-Fa-f]{8}$/, "Código de marcação inválido.");

export function parseCode(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null; // "%E0%A4%A" e afins: 400, não 500
  }
  const r = CodeParam.safeParse(decoded);
  return r.success ? r.data : null;
}

/** Avisos à equipa depois de a operação já estar gravada: nunca podem transformar sucesso em erro. */
async function warnManagers(title: string, body: string, tag: string) {
  try {
    void pushToManagers({ title, body, tag }).catch(() => {});
    const s = await one<{ telegram_notify: boolean }>(`select telegram_notify from public.salon_settings where id = 1`);
    if (s?.telegram_notify) void notifyTelegram(`${title}\n${body}`).catch(() => {});
  } catch (e) {
    console.error("[agente] aviso à equipa falhou", e instanceof Error ? e.message : e);
  }
}

export async function rescheduleAppointment(ctx: AgentCtx, code: string, body: z.infer<typeof RescheduleBody>) {
  const clientId = await clientIdByPhone(ctx.phone);
  if (!clientId) return json(NOT_FOUND, 404);
  let ap: { code: string; start_time: string; status: string } | null;
  try {
    ap = await one(`select code, start_time, status from public.agent_reschedule_appointment($1, $2, $3::timestamptz)`, [
      code,
      clientId,
      body.inicio,
    ]);
  } catch (e) {
    return fail(e);
  }
  if (!ap) return fail("");
  await warnManagers("Marcação remarcada (WhatsApp)", `#${ap.code} → ${fmtWhen(ap.start_time)}`, `ap-${ap.code}`);
  return json({ ok: true, marcacao: { codigo: ap.code, inicio: ap.start_time, quando: fmtWhen(ap.start_time), estado: ap.status } });
}

export async function cancelAppointment(ctx: AgentCtx, code: string, reason: string | null) {
  const clientId = await clientIdByPhone(ctx.phone);
  if (!clientId) return json(NOT_FOUND, 404);
  let ap: { code: string; start_time: string } | null;
  try {
    ap = await one(`select code, start_time from public.agent_cancel_appointment($1, $2, $3)`, [code, clientId, reason?.slice(0, 300) ?? null]);
  } catch (e) {
    return fail(e);
  }
  if (!ap) return fail("");
  await warnManagers("Marcação cancelada (WhatsApp)", `#${ap.code} · ${fmtWhen(ap.start_time)}`, `ap-${ap.code}`);
  return json({ ok: true, marcacao: { codigo: ap.code, estado: "cancelled" } });
}

/** "CONFIRMAR #código" (o texto que o site prepara para o WhatsApp): confirma se a marcação for deste número. */
export async function confirmAppointment(ctx: AgentCtx, code: string) {
  const clientId = await clientIdByPhone(ctx.phone);
  if (!clientId) return json(NOT_FOUND, 404);
  let ap: { code: string; start_time: string; status: string } | null;
  try {
    ap = await one(`select code, start_time, status from public.agent_confirm_appointment($1, $2)`, [code, clientId]);
  } catch (e) {
    if (dbErrorMessage(e).includes("DEPOSIT_REQUIRED")) {
      return json({ ok: false, code: "DEPOSIT_REQUIRED", error: "Esta marcação tem um sinal por pagar; a confirmação fica feita com o pagamento." }, 409);
    }
    return fail(e);
  }
  if (!ap) return fail("");
  await warnManagers("Marcação confirmada (WhatsApp)", `#${ap.code} · ${fmtWhen(ap.start_time)}`, `ap-${ap.code}`);
  return json({ ok: true, marcacao: { codigo: ap.code, inicio: ap.start_time, quando: fmtWhen(ap.start_time), estado: ap.status } });
}

// ---------------------------------------------------------------- humano

export const HandoffBody = z.object({
  motivo: z.string().max(200).transform(oneLine).pipe(z.string().min(2)),
  resumo: z.string().trim().max(1000).optional(),
  nome: z.string().max(80).transform(oneLine).optional(),
});

/**
 * Avisa a equipa. Os textos vêm da conversa (logo, da cliente): vão marcados como
 * tal e numa linha só, para ninguém forjar "linhas" no aviso.
 * Devolve ok:false se nenhum canal conseguiu avisar — a central então não pausa o bot.
 */
export async function handoff(ctx: AgentCtx, body: z.infer<typeof HandoffBody>) {
  if (!rateLimit(`handoff:${ctx.phone}`, 3, 60 * 60_000)) {
    return json({ ok: true, jaAvisado: true }); // já avisámos há pouco: não encher o telemóvel da equipa
  }
  const who = body.nome ? `${body.nome} · ${ctx.phone}` : ctx.phone;
  const [push, tg] = await Promise.allSettled([
    pushToManagers({ title: "Cliente pede atendimento humano", body: `${who}\n(cliente) ${body.motivo}`, tag: `handoff-${ctx.phone}` }),
    notifyTelegram(
      `🙋 Cliente pede atendimento humano no WhatsApp\n${who}\nMotivo (escrito na conversa): ${body.motivo}` +
        (body.resumo ? `\n\n— resumo da conversa (não verificado) —\n${body.resumo}` : ""),
    ),
  ]);
  const delivered = (push.status === "fulfilled" && push.value > 0) || (tg.status === "fulfilled" && tg.value === true);
  if (!delivered) {
    return json({ ok: false, code: "NOTIFY_FAILED", error: "Não consegui avisar a equipa agora. Indique à cliente o telefone do salão." }, 502);
  }
  return json({ ok: true });
}
