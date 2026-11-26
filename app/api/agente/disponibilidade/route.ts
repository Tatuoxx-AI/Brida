import { AvailabilityQuery, agentRequest, badRequest, getAvailability, json } from "@/lib/agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?data=AAAA-MM-DD&servicos=uuid,uuid&profissional=uuid&dias=1..7 (ferramenta ver_disponibilidade). */
export async function GET(req: Request) {
  const r = await agentRequest(req);
  if (r instanceof Response) return r;
  const q = AvailabilityQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return badRequest(q.error);
  return json(await getAvailability(q.data));
}
