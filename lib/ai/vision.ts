import "server-only";
import { z } from "zod";

/**
 * Lê uma foto de um papel, de um cartão ou de um print do WhatsApp e tira de lá
 * os dados de uma marcação.
 *
 * **A imagem não é guardada em lado nenhum.** Chega por memória, vai ao modelo
 * e desaparece quando o pedido acaba — não vai para a base, não vai para disco
 * e não entra nos registos. Guardamos só os campos extraídos, e mesmo esses só
 * depois de o dono confirmar.
 *
 * Usa Claude quando há ANTHROPIC_API_KEY; sem ela usa a visão do modelo da
 * OpenAI, que é a chave que este projeto já tem. As duas respondem o mesmo
 * JSON, por isso o resto do código não sabe qual correu.
 */

export const Extracted = z.object({
  nome: z.string().nullable().default(null),
  telefone: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  servico: z.string().nullable().default(null),
  profissional: z.string().nullable().default(null),
  data: z.string().nullable().default(null), // YYYY-MM-DD
  hora: z.string().nullable().default(null), // HH:MM
  notas: z.string().nullable().default(null),
  texto_lido: z.string().nullable().default(null),
});
export type Extracted = z.infer<typeof Extracted>;

const INSTRUCOES = `És a assistente de um salão de cabeleireiro e estás a ler uma imagem que a dona tirou:
um cartão, um papel escrito à mão, um print de uma conversa de WhatsApp ou uma ficha de cliente.

Tira de lá, se estiverem lá, o nome da cliente, o telefone, o e-mail, o serviço pedido,
a profissional, a data e a hora. Responde SÓ com JSON, sem mais nada à volta:

{"nome":null,"telefone":null,"email":null,"servico":null,"profissional":null,"data":null,"hora":null,"notas":null,"texto_lido":null}

Regras:
- O que não estiver escrito fica null. NUNCA inventes um nome, um número ou uma hora.
- "data" em AAAA-MM-DD e "hora" em HH:MM (24 horas). Datas relativas ("amanhã", "sábado")
  resolvem-se a partir da data de hoje que te é dada.
- Telefone como está escrito; o servidor trata do formato.
- "texto_lido" é o texto que conseguiste ler, em bruto, para a dona conferir.
- "notas" só para pedidos que não cabem nos outros campos.`;

function parse(bruto: string): Extracted {
  const i = bruto.indexOf("{");
  const f = bruto.lastIndexOf("}");
  if (i < 0 || f < i) throw new Error("A resposta do modelo não trouxe JSON.");
  return Extracted.parse(JSON.parse(bruto.slice(i, f + 1)));
}

/** `imagem` é um data URL (data:image/jpeg;base64,…) vindo do browser. */
export async function lerImagem(imagem: string, hoje: string): Promise<Extracted> {
  const m = imagem.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error("Formato de imagem não suportado.");
  const [, tipo, base64] = m;
  const pedido = `${INSTRUCOES}\n\nHoje é ${hoje} (fuso de Portugal).`;

  if (process.env.ANTHROPIC_API_KEY) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const a = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await a.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: tipo as "image/jpeg", data: base64 } },
            { type: "text", text: pedido },
          ],
        },
      ],
    });
    const texto = r.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    return parse(texto);
  }

  const { default: OpenAI } = await import("openai");
  const o = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const r = await o.chat.completions.create({
    // O modelo das conversas pode estar num que não vê imagens; aqui força-se
    // um que vê, e pode trocar-se em OPENAI_VISION_MODEL.
    model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: pedido },
          { type: "image_url", image_url: { url: imagem, detail: "high" } },
        ],
      },
    ],
  });
  return parse(r.choices[0]?.message?.content ?? "");
}

export const motorDeVisao = () => (process.env.ANTHROPIC_API_KEY ? "claude" : "openai");
