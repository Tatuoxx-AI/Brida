import { checkWidgetToken, getWidgetAgenda } from "@/lib/widget";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Resumo do dia para o widget do ecrã inicial. Autenticação: Authorization: Bearer <chave do painel>. */
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!rateLimit(`widget:${ip}`, 30, 60_000)) return Response.json({ error: "Demasiados pedidos." }, { status: 429, headers });
  if (!(await checkWidgetToken(token))) return Response.json({ error: "Chave inválida ou revogada." }, { status: 401, headers });
  return Response.json(await getWidgetAgenda(), { headers });
}
