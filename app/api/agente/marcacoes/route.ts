import { CreateBody, agentRequest, badRequest, createAppointment, json, listAppointments } from "@/lib/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Marcações futuras da cliente deste telefone (ferramenta consultar_reservas_do_cliente). */
export async function GET(req: Request) {
  const r = await agentRequest(req);
  if (r instanceof Response) return r;
  return json(await listAppointments(r.ctx));
}

/** Nova marcação em nome do telefone do WhatsApp (ferramenta criar_reserva). */
export async function POST(req: Request) {
  const r = await agentRequest(req);
  if (r instanceof Response) return r;
  const body = CreateBody.safeParse(r.body);
  if (!body.success) return badRequest(body.error);
  return createAppointment(r.ctx, body.data);
}
