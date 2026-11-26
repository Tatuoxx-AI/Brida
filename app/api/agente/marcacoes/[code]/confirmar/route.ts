import { agentRequest, confirmAppointment, json, parseCode } from "@/lib/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/** Confirma uma marcação pendente DESTE telefone (ferramenta confirmar_reserva — "CONFIRMAR #código"). */
export async function POST(req: Request, { params }: Params) {
  const r = await agentRequest(req);
  if (r instanceof Response) return r;
  const code = parseCode((await params).code);
  if (!code) return json({ ok: false, code: "INVALID", error: "Código de marcação inválido." }, 400);
  return confirmAppointment(r.ctx, code);
}
