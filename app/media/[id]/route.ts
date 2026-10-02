import { one } from "@/lib/db";

/** Fotos carregadas pelo painel. O id muda a cada troca, por isso pode ficar em cache "para sempre". */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const m = await one<{ mime: string; data: Buffer | Uint8Array }>(`select mime, data from public.media where id = $1`, [id]);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
