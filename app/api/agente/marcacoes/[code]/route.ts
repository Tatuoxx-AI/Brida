import { RescheduleBody, agentRequest, badRequest, cancelAppointment, json, parseCode, rescheduleAppointment } from "@/lib/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

const INVALID_CODE = { ok: false, code: "INVALID", error: "Código de marcação inválido." };

/** Remarca uma marcação DESTE telefone (ferramenta alterar_reserva). Body: { inicio }. */
export async function PATCH(req: Request, { params }: Params) {
  const r = await agentRequest(req);
  if (r instanceof Response) return r;
  const code = parseCode((await params).code);
  if (!code) return json(INVALID_CODE, 400);
  const body = RescheduleBody.safeParse(r.body);
  if (!body.success) return badRequest(body.error);
  return rescheduleAppointment(r.ctx, code, body.data);
}

/** Cancela uma marcação DESTE telefone (ferramenta cancelar_reserva). ?motivo= opcional. */
export async function DELETE(req: Request, { params }: Params) {
  const r = await agentRequest(req);
  if (r instanceof Response) return r;
  const code = parseCode((await params).code);
  if (!code) return json(INVALID_CODE, 400);
  return cancelAppointment(r.ctx, code, new URL(req.url).searchParams.get("motivo"));
}
