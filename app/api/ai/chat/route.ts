import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/ai/agent";
import { rateLimit } from "@/lib/rate-limit";
import { currentClient } from "@/lib/client-session";
import { getLocale } from "@/lib/i18n/server";
import { LOCALE_INFO } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(30)
    .refine((m) => m.at(-1)?.role === "user", "A última mensagem tem de ser do cliente."),
});

/** Chat de marcações do site (<AiBookingWidget />). */
export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Assistente indisponível de momento." }, { status: 503 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`chat:${ip}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Muitas mensagens seguidas. Tente daqui a uns minutos." }, { status: 429 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  // Cliente com perfil guardado neste aparelho: marca na sua ficha, sem pedir os dados outra vez.
  const locale = await getLocale();
  const me = await currentClient();
  const profileId = me?.id ?? null;
  const extra = [
    `Responde sempre em ${LOCALE_INFO[locale].aiName} (a língua escolhida pelo visitante), a não ser que o cliente escreva noutra língua.`,
    me
      ? `O cliente tem perfil guardado neste aparelho: ${me.name}${me.phone ? ` (${me.phone})` : ""}${me.email ? `, ${me.email}` : ""}${me.birthDate ? `, aniversário ${me.birthDate}` : ""}. Não peças estes dados; usa-os nas ferramentas.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await runAgent(parsed.data.messages, { channel: "web", profileId, intl: LOCALE_INFO[locale].intl }, extra);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[ai/chat]", e);
    return NextResponse.json({ error: "O assistente falhou. Tente novamente ou ligue-nos." }, { status: 502 });
  }
}
