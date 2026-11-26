import { agentRequest, json, listReminders } from "@/lib/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Marcações próximas/recentes para os lembretes automáticos (pedido de sistema da central). */
export async function GET(req: Request) {
  const r = await agentRequest(req, { semTelefone: true });
  if (r instanceof Response) return r;
  return json(await listReminders());
}
