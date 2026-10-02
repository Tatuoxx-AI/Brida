import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/ai/agent";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

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

  // Cliente com sessão: marca na sua ficha e não precisa de dar nome/telefone.
  let profileId: string | null = null;
  let extra: string | undefined;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data: me } = await supabase.from("profiles").select("id, name, phone").eq("user_id", auth.user.id).maybeSingle();
      if (me) {
        profileId = me.id;
        extra = `O cliente tem sessão iniciada como ${me.name}${me.phone ? ` (${me.phone})` : ""}: não peças nome nem telefone (usa estes valores); pede só email e data de aniversário se ainda não os tiver dado.`;
      }
    }
  }

  try {
    const result = await runAgent(parsed.data.messages, { channel: "web", profileId }, extra);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[ai/chat]", e);
    return NextResponse.json({ error: "O assistente falhou. Tente novamente ou ligue-nos." }, { status: 502 });
  }
}
