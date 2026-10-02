import "server-only";
import { z } from "zod";
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";
import { dbErrorMessage, query } from "@/lib/db";
import { bookingError as toBookingError, createBooking, resolveClient, type BookingSummary } from "@/lib/booking";

export type { BookingSummary };

/** Quem está a falar com o agente. Vem do servidor, nunca do modelo. */
export type AgentContext = {
  channel: "web" | "whatsapp";
  /** ficha do cliente com sessão iniciada no site */
  profileId?: string | null;
  /** número de onde chegou a mensagem (WhatsApp) — dispensa pedir o telefone */
  phone?: string | null;
  timezone: string;
};

export const TOOLS: ChatCompletionFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_horarios",
      description:
        "Lista os horários livres num dia para um conjunto de serviços. Chamar SEMPRE antes de propor um horário.",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "Dia no formato YYYY-MM-DD (fuso do salão)." },
          servicos_ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs dos serviços (principal + extras) tirados do catálogo.",
          },
          profissional_id: { type: "string", description: "Opcional. Omitir para qualquer profissional." },
        },
        required: ["data", "servicos_ids"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_marcacao",
      description:
        "Cria a marcação depois de o cliente confirmar serviço, dia, hora, nome e telefone. " +
        "O campo inicio tem de ser copiado tal e qual de consultar_horarios.",
      parameters: {
        type: "object",
        properties: {
          servicos_ids: { type: "array", items: { type: "string" } },
          inicio: { type: "string", description: "Valor 'inicio' devolvido por consultar_horarios (ISO 8601)." },
          profissional_id: { type: "string", description: "Opcional. Omitir para qualquer profissional." },
          nome: { type: "string" },
          telefone: { type: "string" },
          email: { type: "string" },
          data_nascimento: { type: "string", description: "Data de aniversário no formato YYYY-MM-DD." },
          notas: { type: "string", description: "Pedidos do cliente relevantes para o atendimento." },
        },
        required: ["servicos_ids", "inicio", "nome", "telefone", "email", "data_nascimento"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "entrar_fila_espera",
      description: "Põe o cliente na fila de espera de um dia sem vagas; o salão avisa se houver desistência.",
      parameters: {
        type: "object",
        properties: {
          servico_id: { type: "string" },
          data: { type: "string", description: "YYYY-MM-DD" },
          periodo: { type: "string", enum: ["qualquer", "manha", "tarde", "noite"] },
          nome: { type: "string" },
          telefone: { type: "string" },
        },
        required: ["servico_id", "data", "nome", "telefone"],
        additionalProperties: false,
      },
    },
  },
];

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schemas = {
  consultar_horarios: z.object({
    data: isoDate,
    servicos_ids: z.array(uuid).min(1).max(5),
    profissional_id: uuid.optional(),
  }),
  criar_marcacao: z.object({
    servicos_ids: z.array(uuid).min(1).max(5),
    inicio: z.string().datetime({ offset: true }),
    profissional_id: uuid.optional(),
    nome: z.string().trim().min(2).max(80),
    telefone: z.string().max(30),
    email: z.string().trim().email(),
    data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notas: z.string().max(500).optional(),
  }),
  entrar_fila_espera: z.object({
    servico_id: uuid,
    data: isoDate,
    periodo: z.enum(["qualquer", "manha", "tarde", "noite"]).default("qualquer"),
    nome: z.string().trim().min(2).max(80),
    telefone: z.string().max(30),
  }),
};

type ToolName = keyof typeof schemas;

export type ToolState = { booking?: BookingSummary };

/** Executa uma tool e devolve o JSON que volta ao modelo. Nunca lança. */
export async function runTool(name: string, rawArgs: string, ctx: AgentContext, state: ToolState): Promise<unknown> {
  if (!(name in schemas)) return { erro: `Ferramenta desconhecida: ${name}` };
  let args: unknown;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { erro: "Argumentos inválidos (JSON)." };
  }
  const parsed = schemas[name as ToolName].safeParse(args);
  if (!parsed.success) return { erro: "Argumentos inválidos.", detalhes: parsed.error.issues.map((i) => i.message) };

  try {
    switch (name as ToolName) {
      case "consultar_horarios":
        return await consultarHorarios(parsed.data as z.infer<typeof schemas.consultar_horarios>, ctx);
      case "criar_marcacao":
        return await criarMarcacao(parsed.data as z.infer<typeof schemas.criar_marcacao>, ctx, state);
      case "entrar_fila_espera":
        return await entrarFila(parsed.data as z.infer<typeof schemas.entrar_fila_espera>, ctx);
    }
  } catch (e) {
    console.error(`[ai] tool ${name}`, e);
    return { erro: "Falha técnica ao consultar a agenda. Sugira ligar para o salão." };
  }
}

function bookingError(message: string) {
  const e = toBookingError(message);
  return { erro: e.error, codigo: e.code };
}

const timeFmt = (tz: string) => new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: tz });

async function consultarHorarios(a: z.infer<typeof schemas.consultar_horarios>, ctx: AgentContext) {
  let data: { staff_id: string; staff_name: string; slot_start: string; discount_percent: number }[];
  try {
    data = await query(`select * from public.get_available_slots($1::date, $2::uuid[], $3::uuid)`, [
      a.data,
      a.servicos_ids,
      a.profissional_id ?? null,
    ]);
  } catch (e) {
    return bookingError(dbErrorMessage(e));
  }
  if (!data.length) return { data: a.data, horarios: [], aviso: "Sem vagas neste dia. Ofereça outro dia ou a fila de espera." };

  // agrupa por hora: o cliente escolhe a hora; o profissional é opcional
  const fmt = timeFmt(ctx.timezone);
  const byStart = new Map<string, { inicio: string; hora: string; desconto: number; profissionais: { id: string; nome: string }[] }>();
  for (const s of data) {
    const slot = byStart.get(s.slot_start) ?? {
      inicio: s.slot_start,
      hora: fmt.format(new Date(s.slot_start)),
      desconto: Number(s.discount_percent),
      profissionais: [],
    };
    slot.profissionais.push({ id: s.staff_id, nome: s.staff_name });
    byStart.set(s.slot_start, slot);
  }
  const horarios = [...byStart.values()];
  return {
    data: a.data,
    total: horarios.length,
    // limita o que vai ao modelo; o essencial é ter manhã e tarde representadas
    horarios: horarios.length > 30 ? horarios.filter((_, i) => i % Math.ceil(horarios.length / 30) === 0) : horarios,
  };
}

async function criarMarcacao(a: z.infer<typeof schemas.criar_marcacao>, ctx: AgentContext, state: ToolState) {
  if (state.booking) return { erro: "Já foi criada uma marcação nesta mensagem.", marcacao: state.booking };

  const result = await createBooking({
    serviceIds: a.servicos_ids,
    start: a.inicio,
    staffId: a.profissional_id,
    name: a.nome,
    phone: a.telefone,
    email: a.email,
    birthDate: a.data_nascimento,
    notes: a.notas,
    source: ctx.channel === "whatsapp" ? "whatsapp" : "ai_chat",
    profileId: ctx.profileId,
    knownPhone: ctx.phone,
  });
  if (!result.ok) return { erro: result.error, codigo: result.code };

  const b = (state.booking = result.booking);
  return {
    ok: true,
    codigo: b.code,
    estado: b.status === "confirmed" ? "confirmada" : "por confirmar",
    quando: b.when,
    profissional: b.staffName,
    total_eur: b.total,
    desconto_eur: b.discount,
    instrucao:
      b.status === "confirmed"
        ? "Marcação confirmada. Agradeça e despeça-se."
        : b.confirmationSent
          ? "Diga que enviámos uma mensagem no WhatsApp: basta responder SIM para confirmar. Sem confirmação a vaga não fica garantida."
          : "Diga que a vaga fica reservada mas só fica garantida depois de confirmar no WhatsApp, no botão 'Confirmar no WhatsApp' que aparece abaixo. Não há pagamento.",
  };
}

async function entrarFila(a: z.infer<typeof schemas.entrar_fila_espera>, ctx: AgentContext) {
  const client = await resolveClient(a.nome, a.telefone, { profileId: ctx.profileId, knownPhone: ctx.phone });
  if (!client.ok) return { erro: client.error };
  try {
    await query(
      `insert into public.waitlist (client_id, service_id, preferred_date, preferred_period) values ($1, $2, $3, $4::public.waitlist_period)`,
      [client.id, a.servico_id, a.data, a.periodo],
    );
  } catch (e) {
    if (dbErrorMessage(e).includes("waitlist_one_active_idx")) return { ok: true, aviso: "O cliente já estava na fila para esse dia." };
    return { erro: "Não foi possível entrar na fila." };
  }
  return { ok: true };
}
