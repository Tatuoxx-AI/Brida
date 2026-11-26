import { HandoffBody, agentRequest, badRequest, handoff } from "@/lib/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Avisa a equipa (push + Telegram) que a cliente quer falar com uma pessoa (ferramenta transferir_para_humano). */
export async function POST(req: Request) {
  const r = await agentRequest(req);
  if (r instanceof Response) return r;
  const body = HandoffBody.safeParse(r.body);
  if (!body.success) return badRequest(body.error);
  return handoff(r.ctx, body.data);
}
