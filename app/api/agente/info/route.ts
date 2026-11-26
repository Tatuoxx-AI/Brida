import { agentRequest, getInfo, json } from "@/lib/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serviços, preços, profissionais, horário e regras do salão (ferramenta ver_info_negocio). */
export async function GET(req: Request) {
  const r = await agentRequest(req);
  if (r instanceof Response) return r;
  return json(await getInfo());
}
