"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, one, query } from "@/lib/db";
import { requireManager } from "@/lib/manager-auth";
import { bookingError, resolveClient } from "@/lib/booking";
import { lerImagem, motorDeVisao } from "@/lib/ai/vision";
import { prepararMarcacao, runManagerAgent, type Estado, type MensagemPainel, type Proposta } from "@/lib/ai/manager-agent";

/**
 * Atalho de marcações do painel: voz, foto e confirmação.
 *
 * Duas coisas que não mudam:
 * 1. **nada é gravado sem o botão Confirmar** — o agente só prepara propostas;
 * 2. **a foto não é guardada** — vai ao modelo em memória e morre aqui; fica só
 *    o texto que de lá saiu, e mesmo esse só depois de confirmado.
 */

const TZ = "Europe/Lisbon";
type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export type RespostaPainel = { reply: string } & Estado;

const Mensagem = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) });
const Historico = z.array(Mensagem).max(30);
// 4 MB de data URL ≈ 3 MB de imagem; o browser já a reduz antes de a mandar.
const DataUrl = z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(4_500_000);

export async function mgrQuickTurn(rawHistory: unknown, imagem?: string): Promise<RespostaPainel | { erro: string }> {
  await requireManager();
  const h = Historico.safeParse(rawHistory);
  if (!h.success) return { erro: "Conversa inválida." };

  const historico: MensagemPainel[] = [...h.data];

  if (imagem) {
    if (!DataUrl.safeParse(imagem).success) return { erro: "Imagem inválida ou grande de mais." };
    try {
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
      const dados = await lerImagem(imagem, hoje);
      // A partir daqui a imagem deixa de existir: só segue o que se leu dela.
      const campos = Object.entries(dados)
        .filter(([k, v]) => v && k !== "texto_lido")
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      historico.push({
        role: "user",
        content: campos
          ? `Li esta foto e tirei de lá:\n${campos}\n\nPrepara a marcação com isto. Pergunta só o que faltar.`
          : "Mandei uma foto mas não se percebe nada lá. Pergunta-me os dados.",
      });
    } catch (e) {
      console.error("[painel/visao]", e instanceof Error ? e.message : e);
      return { erro: "Não consegui ler a foto. Tente outra vez com mais luz, ou escreva os dados." };
    }
  }

  try {
    const r = await runManagerAgent(historico);
    return { reply: r.reply, ...r.estado };
  } catch (e) {
    console.error("[painel/ia]", e);
    return { erro: "O assistente não respondeu. Tente outra vez." };
  }
}

/** Qual motor de visão está ligado — o painel diz isto à dona. */
export async function mgrVisionEngine(): Promise<"claude" | "openai"> {
  await requireManager();
  return motorDeVisao();
}

/**
 * Refaz a proposta depois de a dona corrigir o cartão.
 *
 * Existe para o cartão nunca mostrar um total que não seja o que vai ficar
 * gravado: muda-se o serviço ou a hora e é o servidor a dizer o preço, a
 * disponibilidade e o desconto outra vez.
 */
const Preparar = z.object({
  clienteId: z.string().uuid().nullable().optional(),
  nome: z.string().trim().max(80).optional(),
  telefone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  servicosIds: z.array(z.string().uuid()).min(1).max(5),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  profissionalId: z.string().uuid().nullable().optional(),
  notas: z.string().max(500).nullable().optional(),
});

export async function mgrPrepareDraft(raw: unknown): Promise<RespostaPainel | { erro: string }> {
  await requireManager();
  const p = Preparar.safeParse(raw);
  if (!p.success) return { erro: "Faltam dados para preparar a marcação." };
  const r = await prepararMarcacao(p.data);
  if (!r.ok) return { reply: r.error, alternativas: r.alternativas };
  return { reply: "", proposta: r.proposta };
}

// -----------------------------------------------------------------------------
// Confirmação — o único sítio que escreve
// -----------------------------------------------------------------------------
const Criar = z.object({
  kind: z.literal("criar"),
  clientId: z.string().uuid().nullable(),
  clientName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).nullable(),
  email: z.string().trim().max(120).nullable(),
  serviceIds: z.array(z.string().uuid()).min(1).max(5),
  serviceNames: z.array(z.string()).default([]),
  staffId: z.string().uuid().nullable(),
  staffName: z.string().nullable(),
  start: z.string().datetime({ offset: true }),
  date: z.string(),
  time: z.string(),
  price: z.number(),
  discountPct: z.number(),
  total: z.number(),
  notes: z.string().max(500).nullable(),
});
const Editar = z.object({
  kind: z.literal("editar"),
  appointmentId: z.string().uuid(),
  resumo: z.string(),
  start: z.string().datetime({ offset: true }),
  date: z.string(),
  time: z.string(),
});
const Cancelar = z.object({
  kind: z.literal("cancelar"),
  appointmentId: z.string().uuid(),
  resumo: z.string(),
  motivo: z.string().max(200).nullable(),
});
const PropostaSchema = z.discriminatedUnion("kind", [Criar, Editar, Cancelar]);

export async function mgrConfirmDraft(raw: unknown): Promise<Result<{ mensagem: string }>> {
  await requireManager();
  const p = PropostaSchema.safeParse(raw);
  if (!p.success) return fail("A proposta chegou incompleta. Refaça o pedido.");
  const d = p.data as Proposta;

  try {
    if (d.kind === "criar") {
      let clientId = d.clientId;
      if (!clientId) {
        if (!d.phone) return fail("Falta o telefone para criar a ficha.");
        // Só aqui é que a ficha nasce — e com o que a dona viu no cartão.
        const c = await resolveClient(d.clientName, d.phone, { email: d.email });
        if (!c.ok) return fail(c.error);
        clientId = c.id;
      }
      const ap = await one<{ id: string; code: string }>(
        `select id, code from public.book_appointment($1::uuid[], $2::timestamptz, $3::uuid, $4::uuid, null, null, 'admin', $5)`,
        [d.serviceIds, d.start, d.staffId, clientId, d.notes],
      );
      if (!ap) return fail("Não foi possível marcar.");
      revalidatePath("/painel");
      return { ok: true, data: { mensagem: `Marcado · #${ap.code}` } };
    }

    if (d.kind === "editar") {
      await query(`select id from public.reschedule_appointment($1::uuid, $2::timestamptz, null)`, [d.appointmentId, d.start]);
      revalidatePath("/painel");
      return { ok: true, data: { mensagem: "Marcação mudada ✓" } };
    }

    await query(`select id from public.cancel_appointment($1::uuid, $2)`, [d.appointmentId, d.motivo ?? "Cancelado no painel"]);
    revalidatePath("/painel");
    return { ok: true, data: { mensagem: "Marcação cancelada ✓" } };
  } catch (e) {
    return fail(bookingError(dbErrorMessage(e)).error);
  }
}

// -----------------------------------------------------------------------------
// Procurar clientes — sem IA, de graça: ignora acentos e maiúsculas e aceita
// nomes meio escritos ou com erros ("joana silv", "ines" → Inês), ou o telefone.
// -----------------------------------------------------------------------------
export type ClienteEncontrada = { id: string; name: string; phone: string | null; visits: number; lastVisit: string | null };

export async function mgrFindClients(rawTermo: string): Promise<ClienteEncontrada[]> {
  await requireManager();
  const termo = String(rawTermo ?? "").trim().slice(0, 60);
  if (!termo) return [];
  const digitos = termo.replace(/\D/g, "");
  return query<ClienteEncontrada>(
    `select p.id, p.name, p.phone,
            (select count(*) from public.appointments a where a.client_id = p.id and a.status = 'completed')::int as visits,
            (select max(start_time) from public.appointments a where a.client_id = p.id and a.status = 'completed') as "lastVisit"
       from public.profiles p
      where p.role = 'client'
        and (public.norm_text(p.name) like '%' || public.norm_text($1) || '%'
             or similarity(public.norm_text(p.name), public.norm_text($1)) > 0.25
             or ($2 <> '' and length($2) >= 3 and replace(coalesce(p.phone, ''), ' ', '') like '%' || $2 || '%'))
      order by (public.norm_text(p.name) like public.norm_text($1) || '%') desc,
               similarity(public.norm_text(p.name), public.norm_text($1)) desc, p.name
      limit 8`,
    [termo, digitos],
  );
}
