import { NextResponse } from "next/server";
import { inviterByCode, inviteUrl } from "@/lib/invite";
import { qrPng } from "@/lib/qr";

// PNG do QR de um convite. Público de propósito: o código já está no endereço
// que a pessoa vai partilhar, e é só isso que o QR contém — nenhum dado da
// ficha passa por aqui.
//
// Em PNG e não em SVG porque é o que o botão "Partilhar" do telemóvel sabe
// mandar para o WhatsApp e para o Instagram.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const inviter = await inviterByCode(codigo);
  if (!inviter) return new NextResponse("Código desconhecido", { status: 404 });

  const png = await qrPng(inviteUrl(codigo.toUpperCase()));
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="convite-${codigo.toUpperCase()}.png"`,
      // O código não muda; o desenho também não.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
