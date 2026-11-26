import { agentRequest, getClient, json } from "@/lib/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ficha do próprio número (nome guardado), para não perguntar o nome de novo. */
export async function GET(req: Request) {
  const r = await agentRequest(req);
  if (r instanceof Response) return r;
  return json(await getClient(r.ctx));
}
