import { NextResponse, type NextRequest } from "next/server";
import { runAgent } from "@/lib/ai/agent";
import { one } from "@/lib/db";
import { handleIncomingText, parseIncoming, sendWhatsApp, verifySignature, verifyWebhookChallenge } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Webhook do WhatsApp Business (Meta). Registar no Meta for Developers com:
 *   URL: https://<domínio>/api/webhooks/whatsapp · Verify token: o do painel → Automação
 */
export async function GET(request: NextRequest) {
  const challenge = await verifyWebhookChallenge(request.nextUrl.searchParams);
  return challenge ? new NextResponse(challenge) : new NextResponse("forbidden", { status: 403 });
}

/**
 *   1. "SIM" / "NÃO" / "CONFIRMAR #CÓDIGO" → confirma ou cancela a marcação pendente desse número;
 *   2. o resto vai para a assistente de IA, se "a assistente responde no WhatsApp" estiver ligado.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256")))) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  const settings = await one<{ ai_whatsapp_reply: boolean }>(`select ai_whatsapp_reply from public.salon_settings where id = 1`);
  for (const msg of parseIncoming(raw)) {
    try {
      let reply = await handleIncomingText(msg.from, msg.text);
      if (!reply && settings?.ai_whatsapp_reply) {
        // TODO: guardar o histórico por número para a IA ter contexto entre mensagens.
        reply = (await runAgent([{ role: "user", content: msg.text }], { channel: "whatsapp", phone: msg.from })).reply;
      }
      if (reply) await sendWhatsApp(msg.from, reply);
    } catch (e) {
      console.error("[whatsapp] mensagem", msg.id, e);
    }
  }
  // a Meta reenvia se não receber 200 depressa
  return NextResponse.json({ ok: true });
}
