import "server-only";
import OpenAI from "openai";
import type { ChatCompletionFunctionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { one, query } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

/**
 * O assistente da área do dono — um atalho para marcar à mão, por voz ou por foto.
 *
 * A diferença que importa face ao assistente do site: **este nunca grava nada.**
 * As ferramentas que parecem escrever (criar_cliente, criar_marcacao,
 * editar_marcacao, cancelar_marcacao) só preparam uma proposta. O painel mostra
 * a proposta num cartão que se pode corrigir, e só o botão "Confirmar" é que
 * manda gravar. Um modelo que ouve mal uma hora não pode pôr ninguém na agenda.
 */

const TZ = "Europe/Lisbon";
const MAX_ROUNDS = 6;

export type Proposta =
  | {
      kind: "criar";
      clientId: string | null;
      clientName: string;
      phone: string | null;
      email: string | null;
      serviceIds: string[];
      serviceNames: string[];
      staffId: string | null;
      staffName: string | null;
      /** ISO 8601 com fuso, tal como veio de ver_disponibilidade */
      start: string;
      date: string;
      time: string;
      price: number;
      discountPct: number;
      total: number;
      notes: string | null;
    }
  | { kind: "editar"; appointmentId: string; resumo: string; start: string; date: string; time: string }
  | { kind: "cancelar"; appointmentId: string; resumo: string; motivo: string | null };

export type Opcao = { id: string; name: string; phoneTail: string | null; lastVisit: string | null };

export type Estado = {
  proposta?: Proposta;
  /** nome ambíguo: o painel mostra estas opções em pastilhas */
  opcoes?: Opcao[];
  /** horários livres mais perto do pedido, quando o pedido estava ocupado */
  alternativas?: { start: string; time: string; staffId: string; staffName: string }[];
};

let openai: OpenAI | null = null;
// OPENAI_BASE_URL permite apontar para outro fornecedor compatível (ou para um
// servidor de testes). Vazio = a OpenAI, como sempre.
const client = () =>
  (openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined }));

// -----------------------------------------------------------------------------
// Ferramentas
// -----------------------------------------------------------------------------
export const MGR_TOOLS: ChatCompletionFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "procurar_cliente",
      description:
        "Procura clientes pelo nome (aceita acentos a menos e erros pequenos) ou pelo telefone. " +
        "Devolve também as próximas marcações de cada uma, para editar ou cancelar.",
      parameters: {
        type: "object",
        properties: { termo: { type: "string", description: "Nome ou telefone, como foi dito." } },
        required: ["termo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_cliente",
      description:
        "Prepara uma ficha nova para quem ainda não é cliente. NÃO grava: a ficha só é criada quando a dona confirmar a marcação.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string" },
          telefone: { type: "string" },
          email: { type: "string" },
        },
        required: ["nome"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ver_disponibilidade",
      description: "Horários livres de um dia para um conjunto de serviços. Chamar SEMPRE antes de propor uma hora.",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "AAAA-MM-DD" },
          servicos_ids: { type: "array", items: { type: "string" } },
          profissional_id: { type: "string" },
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
        "Prepara a marcação para a dona confirmar. NÃO grava nada. " +
        "Se a hora pedida estiver ocupada devolve as três horas livres mais próximas.",
      parameters: {
        type: "object",
        properties: {
          cliente_id: { type: "string", description: "ID vindo de procurar_cliente. Omitir se for cliente nova." },
          nome: { type: "string", description: "Obrigatório se não houver cliente_id." },
          telefone: { type: "string" },
          email: { type: "string" },
          servicos_ids: { type: "array", items: { type: "string" } },
          data: { type: "string", description: "AAAA-MM-DD" },
          hora: { type: "string", description: "HH:MM" },
          profissional_id: { type: "string" },
          notas: { type: "string" },
        },
        required: ["servicos_ids", "data", "hora"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editar_marcacao",
      description: "Prepara a mudança de dia/hora de uma marcação. NÃO grava.",
      parameters: {
        type: "object",
        properties: {
          marcacao_id: { type: "string" },
          data: { type: "string", description: "AAAA-MM-DD" },
          hora: { type: "string", description: "HH:MM" },
        },
        required: ["marcacao_id", "data", "hora"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancelar_marcacao",
      description: "Prepara o cancelamento de uma marcação. NÃO grava.",
      parameters: {
        type: "object",
        properties: { marcacao_id: { type: "string" }, motivo: { type: "string" } },
        required: ["marcacao_id"],
        additionalProperties: false,
      },
    },
  },
];

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const horas = z.string().regex(/^\d{2}:\d{2}$/);

const schemas = {
  procurar_cliente: z.object({ termo: z.string().trim().min(1).max(60) }),
  criar_cliente: z.object({
    nome: z.string().trim().min(2).max(80),
    telefone: z.string().trim().max(30).optional(),
    email: z.string().trim().max(120).optional(),
  }),
  ver_disponibilidade: z.object({ data: isoDate, servicos_ids: z.array(uuid).min(1).max(5), profissional_id: uuid.optional() }),
  criar_marcacao: z.object({
    cliente_id: uuid.optional(),
    nome: z.string().trim().min(2).max(80).optional(),
    telefone: z.string().trim().max(30).optional(),
    email: z.string().trim().max(120).optional(),
    servicos_ids: z.array(uuid).min(1).max(5),
    data: isoDate,
    hora: horas,
    profissional_id: uuid.optional(),
    notas: z.string().max(500).optional(),
  }),
  editar_marcacao: z.object({ marcacao_id: uuid, data: isoDate, hora: horas }),
  cancelar_marcacao: z.object({ marcacao_id: uuid, motivo: z.string().max(200).optional() }),
};
type ToolName = keyof typeof schemas;

const hora = (iso: string) => new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const dia = (iso: string) => new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeZone: TZ }).format(new Date(iso));

type Slot = { staff_id: string; staff_name: string; slot_start: string; discount_percent: number };

async function slotsDoDia(data: string, servicos: string[], profissional?: string): Promise<Slot[]> {
  return query<Slot>(`select * from public.get_available_slots($1::date, $2::uuid[], $3::uuid)`, [data, servicos, profissional ?? null]);
}

/** As três horas livres mais perto da pedida. É o que o salão diria ao telefone. */
function maisPerto(slots: Slot[], alvoIso: string, quantos = 3) {
  const alvo = new Date(alvoIso).getTime();
  const porHora = new Map<string, Slot>();
  for (const s of slots) if (!porHora.has(s.slot_start)) porHora.set(s.slot_start, s);
  return [...porHora.values()]
    .sort((a, b) => Math.abs(new Date(a.slot_start).getTime() - alvo) - Math.abs(new Date(b.slot_start).getTime() - alvo))
    .slice(0, quantos)
    .map((s) => ({ start: s.slot_start, time: hora(s.slot_start), staffId: s.staff_id, staffName: s.staff_name }));
}

export type EntradaMarcacao = {
  clienteId?: string | null;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  servicosIds: string[];
  data: string;
  hora: string;
  profissionalId?: string | null;
  notas?: string | null;
};

export type ResultadoPreparar =
  | { ok: true; proposta: Extract<Proposta, { kind: "criar" }> }
  | { ok: false; error: string; alternativas?: Estado["alternativas"] };

/**
 * Monta a proposta de marcação: confirma que a hora está mesmo livre, resolve a
 * ficha e calcula o preço com desconto.
 *
 * Vive aqui e não dentro da ferramenta porque o painel também a chama quando a
 * dona corrige o cartão à mão — e o que ela vê no cartão tem de sair da mesma
 * conta que o servidor vai gravar, senão o total do ecrã e o total da base
 * divergem sem ninguém dar por isso.
 */
export async function prepararMarcacao(e: EntradaMarcacao): Promise<ResultadoPreparar> {
  if (!e.clienteId && !e.nome?.trim()) return { ok: false, error: "Falta o nome da cliente." };

  const alvo = await one<{ iso: string }>(`select (($1::date + $2::time) at time zone $3)::text as iso`, [e.data, e.hora, TZ]);
  if (!alvo) return { ok: false, error: "Data ou hora inválida." };
  const alvoIso = new Date(alvo.iso).toISOString();

  const slots = await slotsDoDia(e.data, e.servicosIds, e.profissionalId ?? undefined);
  const livre = slots.filter((s) => new Date(s.slot_start).getTime() === new Date(alvoIso).getTime());
  if (!livre.length) {
    return {
      ok: false,
      error: slots.length ? "Essa hora está ocupada." : "Não há vagas nesse dia.",
      alternativas: slots.length ? maisPerto(slots, alvoIso) : undefined,
    };
  }

  const escolhido = livre.find((s) => s.staff_id === e.profissionalId) ?? livre[0];
  const servicos = await query<{ id: string; name: string; price: number }>(
    `select id, name, price from public.services where id = any($1::uuid[])`,
    [e.servicosIds],
  );
  if (servicos.length !== new Set(e.servicosIds).size) return { ok: false, error: "Serviço desconhecido." };
  const preco = servicos.reduce((t, s) => t + Number(s.price), 0);

  let clientId = e.clienteId ?? null;
  let nome = e.nome?.trim() ?? "";
  let telefone = e.telefone ? normalizePhone(e.telefone) : null;
  let desconto = 0;
  if (clientId) {
    const p = await one<{ name: string; phone: string | null; d: number }>(
      `select name, phone, invite_discount_percent as d from public.profiles where id = $1`,
      [clientId],
    );
    if (!p) return { ok: false, error: "Cliente desconhecida." };
    nome = nome || p.name;
    telefone = telefone ?? p.phone;
    desconto = Number(p.d ?? 0);
  } else if (telefone) {
    // O telefone pode já ser de uma ficha: nesse caso é essa, e o desconto dela conta.
    const p = await one<{ id: string; name: string; d: number }>(
      `select id, name, invite_discount_percent as d from public.profiles where phone = $1`,
      [telefone],
    );
    if (p) {
      clientId = p.id;
      nome = p.name;
      desconto = Number(p.d ?? 0);
    }
  }

  // A mesma regra do book_appointment: fica o maior, não a soma.
  const pct = Math.max(Number(escolhido.discount_percent ?? 0), desconto);
  return {
    ok: true,
    proposta: {
      kind: "criar",
      clientId,
      clientName: nome,
      phone: telefone,
      email: e.email?.trim() || null,
      serviceIds: e.servicosIds,
      serviceNames: servicos.map((s) => s.name),
      staffId: escolhido.staff_id,
      staffName: escolhido.staff_name,
      start: escolhido.slot_start,
      date: e.data,
      time: hora(escolhido.slot_start),
      price: preco,
      discountPct: pct,
      total: Math.round(preco * (1 - pct / 100) * 100) / 100,
      notes: e.notas?.trim() || null,
    },
  };
}

async function correrFerramenta(nome: string, args: unknown, estado: Estado): Promise<unknown> {
  switch (nome as ToolName) {
    case "procurar_cliente": {
      const a = args as z.infer<typeof schemas.procurar_cliente>;
      const rows = await query<{ id: string; name: string; phone: string | null; last: string | null; visits: number }>(
        `select p.id, p.name, p.phone,
                (select max(start_time) from public.appointments a where a.client_id = p.id and a.status = 'completed') as last,
                (select count(*) from public.appointments a where a.client_id = p.id and a.status = 'completed')::int as visits
           from public.profiles p
          where p.role = 'client'
            and (public.norm_text(p.name) like '%' || public.norm_text($1) || '%'
                 or similarity(public.norm_text(p.name), public.norm_text($1)) > 0.3
                 or replace(coalesce(p.phone, ''), ' ', '') like '%' || replace($1, ' ', '') || '%')
          order by similarity(public.norm_text(p.name), public.norm_text($1)) desc, p.name
          limit 8`,
        [a.termo],
      );
      if (rows.length > 1) {
        // O painel transforma isto em pastilhas para a dona tocar.
        estado.opcoes = rows.map((r) => ({
          id: r.id,
          name: r.name,
          phoneTail: r.phone ? r.phone.replace(/\D/g, "").slice(-3) : null,
          lastVisit: r.last,
        }));
      }
      const proximas = rows.length
        ? await query<{ id: string; client_id: string; start_time: string; servico: string; staff: string }>(
            `select a.id, a.client_id, a.start_time, st.name as staff,
                    coalesce((select string_agg(sv.name, ' + ' order by s.position) from public.appointment_services s
                              join public.services sv on sv.id = s.service_id where s.appointment_id = a.id),
                             (select name from public.services where id = a.service_id)) as servico
               from public.appointments a join public.profiles st on st.id = a.staff_id
              where a.client_id = any($1::uuid[]) and a.status in ('pending', 'confirmed') and a.start_time >= now()
              order by a.start_time limit 10`,
            [rows.map((r) => r.id)],
          )
        : [];
      return {
        clientes: rows.map((r) => ({
          id: r.id,
          nome: r.name,
          telefone_fim: r.phone ? r.phone.replace(/\D/g, "").slice(-3) : null,
          visitas: r.visits,
          ultima_visita: r.last ? dia(r.last) : null,
          marcacoes: proximas.filter((p) => p.client_id === r.id).map((p) => ({ id: p.id, quando: `${dia(p.start_time)} ${hora(p.start_time)}`, servico: p.servico, com: p.staff })),
        })),
        aviso: rows.length === 0 ? "Ninguém com esse nome. Usa criar_cliente." : rows.length > 1 ? "Mais do que uma: pergunta qual antes de seguir." : undefined,
      };
    }

    case "criar_cliente": {
      const a = args as z.infer<typeof schemas.criar_cliente>;
      const tel = a.telefone ? normalizePhone(a.telefone) : null;
      if (a.telefone && !tel) return { erro: "Telefone inválido. Ex.: 912 345 678." };
      // Já existe? Então não é ficha nova.
      if (tel) {
        const ja = await one<{ id: string; name: string }>(`select id, name from public.profiles where phone = $1`, [tel]);
        if (ja) return { ok: true, ja_existia: true, cliente_id: ja.id, nome: ja.name };
      }
      return { ok: true, preparada: true, nome: a.nome, telefone: tel, email: a.email ?? null, nota: "A ficha só é criada quando a dona confirmar." };
    }

    case "ver_disponibilidade": {
      const a = args as z.infer<typeof schemas.ver_disponibilidade>;
      const slots = await slotsDoDia(a.data, a.servicos_ids, a.profissional_id);
      if (!slots.length) return { data: a.data, horarios: [], aviso: "Dia cheio. Oferece outro dia." };
      const porHora = new Map<string, { inicio: string; hora: string; profissionais: { id: string; nome: string }[] }>();
      for (const s of slots) {
        const v = porHora.get(s.slot_start) ?? { inicio: s.slot_start, hora: hora(s.slot_start), profissionais: [] };
        v.profissionais.push({ id: s.staff_id, nome: s.staff_name });
        porHora.set(s.slot_start, v);
      }
      return { data: a.data, horarios: [...porHora.values()] };
    }

    case "criar_marcacao": {
      const a = args as z.infer<typeof schemas.criar_marcacao>;
      const r = await prepararMarcacao({
        clienteId: a.cliente_id,
        nome: a.nome,
        telefone: a.telefone,
        email: a.email,
        servicosIds: a.servicos_ids,
        data: a.data,
        hora: a.hora,
        profissionalId: a.profissional_id,
        notas: a.notas,
      });
      if (!r.ok) {
        if (r.alternativas) estado.alternativas = r.alternativas;
        return {
          erro: r.error,
          alternativas: r.alternativas?.map((x) => `${x.time} com ${x.staffName}`),
          instrucao: r.alternativas ? "Mostra estas três à dona e pergunta qual serve." : undefined,
        };
      }
      estado.proposta = r.proposta;
      const p = r.proposta;
      return {
        ok: true,
        preparada: true,
        resumo: `${p.clientName || "(sem nome)"} · ${p.serviceNames.join(" + ")} · ${dia(p.start)} ${p.time} · ${p.staffName} · ${p.total.toFixed(2)} €${p.discountPct ? ` (−${p.discountPct}%)` : ""}`,
        instrucao: "Diz numa frase o que vais marcar e pede para confirmar no cartão. NÃO digas que já está marcado.",
      };
    }

    case "editar_marcacao": {
      const a = args as z.infer<typeof schemas.editar_marcacao>;
      const ap = await one<{ id: string; client: string; servico: string; antes: string }>(
        `select a.id, coalesce(p.name, a.guest_name, 'Cliente') as client, a.start_time::text as antes,
                coalesce((select string_agg(sv.name, ' + ' order by s.position) from public.appointment_services s
                          join public.services sv on sv.id = s.service_id where s.appointment_id = a.id),
                         (select name from public.services where id = a.service_id)) as servico
           from public.appointments a left join public.profiles p on p.id = a.client_id
          where a.id = $1 and a.status in ('pending', 'confirmed')`,
        [a.marcacao_id],
      );
      if (!ap) return { erro: "Marcação não encontrada ou já fechada." };
      const alvo = await one<{ iso: string }>(`select (($1::date + $2::time) at time zone $3)::text as iso`, [a.data, a.hora, TZ]);
      if (!alvo) return { erro: "Data ou hora inválida." };
      estado.proposta = {
        kind: "editar",
        appointmentId: ap.id,
        resumo: `${ap.client} · ${ap.servico} · de ${dia(ap.antes)} ${hora(ap.antes)} para ${dia(alvo.iso)} ${a.hora}`,
        start: new Date(alvo.iso).toISOString(),
        date: a.data,
        time: a.hora,
      };
      return { ok: true, preparada: true, instrucao: "Pede confirmação no cartão. NÃO digas que já foi mudada." };
    }

    case "cancelar_marcacao": {
      const a = args as z.infer<typeof schemas.cancelar_marcacao>;
      const ap = await one<{ id: string; client: string; servico: string; quando: string }>(
        `select a.id, coalesce(p.name, a.guest_name, 'Cliente') as client, a.start_time::text as quando,
                coalesce((select string_agg(sv.name, ' + ' order by s.position) from public.appointment_services s
                          join public.services sv on sv.id = s.service_id where s.appointment_id = a.id),
                         (select name from public.services where id = a.service_id)) as servico
           from public.appointments a left join public.profiles p on p.id = a.client_id
          where a.id = $1 and a.status in ('pending', 'confirmed')`,
        [a.marcacao_id],
      );
      if (!ap) return { erro: "Marcação não encontrada ou já fechada." };
      estado.proposta = {
        kind: "cancelar",
        appointmentId: ap.id,
        resumo: `${ap.client} · ${ap.servico} · ${dia(ap.quando)} ${hora(ap.quando)}`,
        motivo: a.motivo ?? null,
      };
      return { ok: true, preparada: true, instrucao: "Pede confirmação no cartão. NÃO digas que já foi cancelada." };
    }
  }
}

export async function runManagerTool(nome: string, rawArgs: string, estado: Estado): Promise<unknown> {
  if (!(nome in schemas)) return { erro: `Ferramenta desconhecida: ${nome}` };
  let args: unknown;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { erro: "Argumentos inválidos (JSON)." };
  }
  const p = schemas[nome as ToolName].safeParse(args);
  if (!p.success) return { erro: "Argumentos inválidos.", detalhes: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  try {
    return await correrFerramenta(nome, p.data, estado);
  } catch (e) {
    console.error(`[painel/ia] ${nome}`, e);
    return { erro: "Falha técnica a consultar a agenda." };
  }
}

// -----------------------------------------------------------------------------
// Conversa
// -----------------------------------------------------------------------------
async function contexto(): Promise<string> {
  const [servicos, equipa] = await Promise.all([
    query<{ id: string; name: string; duration_minutes: number; price: number; is_addon: boolean }>(
      `select id, name, duration_minutes, price, is_addon from public.services where active order by sort_order`,
    ),
    query<{ id: string; name: string }>(`select id, name from public.profiles where role in ('staff', 'admin') and active order by team_order, name`),
  ]);
  const agora = new Date();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(agora);
  const diaSemana = new Intl.DateTimeFormat("pt-PT", { weekday: "long", timeZone: TZ }).format(agora);

  return `És o atalho de marcações da dona do salão Brida Coiffeur, no painel privado dela.
Ela fala contigo por voz ou manda uma foto de um papel. O teu trabalho é preparar a marcação, não conversar.

Hoje é ${diaSemana}, ${hoje} (hora de Portugal).

SERVIÇOS (usa os ids):
${servicos.map((s) => `- ${s.is_addon ? "[extra] " : ""}${s.name} · ${s.duration_minutes} min · ${Number(s.price).toFixed(2)} € · id=${s.id}`).join("\n")}

EQUIPA:
${equipa.map((p) => `- ${p.name} · id=${p.id}`).join("\n")}

COMO TRABALHAR
1. Procura a cliente com procurar_cliente antes de tudo. Se vier mais do que uma, PERGUNTA qual (o painel mostra pastilhas) e espera.
2. Se não existir, usa criar_cliente.
3. Chama ver_disponibilidade antes de dares uma hora como boa.
4. Chama criar_marcacao. Se a hora estiver ocupada, apresenta as três alternativas que te vierem.
5. Se faltar alguma coisa (serviço, dia, hora, nome), pergunta SÓ o que falta, numa frase.

REGRAS
- Nada do que fazes grava seja o que for. Depois de preparar, diz o que vais marcar e pede para confirmar no cartão.
- NUNCA digas "está marcado", "já cancelei" ou "já mudei". Diz "preparei", "confirma aí".
- Português de Portugal, frases curtas, sem markdown. A dona está com o telemóvel na mão.
- Nunca inventes serviços, preços, nomes ou horas.`;
}

export type MensagemPainel = { role: "user" | "assistant"; content: string };

export async function runManagerAgent(historico: MensagemPainel[]): Promise<{ reply: string; estado: Estado }> {
  const estado: Estado = {};
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: await contexto() },
    ...historico.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const r = await client().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages,
      tools: MGR_TOOLS,
      temperature: 0.2,
      max_tokens: 400,
    });
    const msg = r.choices[0]?.message;
    if (!msg) break;
    const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
    if (!calls.length) return { reply: msg.content?.trim() || "Diga outra vez, se faz favor.", estado };
    messages.push(msg);
    for (const c of calls) {
      const out = await runManagerTool(c.function.name, c.function.arguments, estado);
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
    }
  }
  return { reply: "Não consegui fechar isto. Marque pela Agenda, por favor.", estado };
}
