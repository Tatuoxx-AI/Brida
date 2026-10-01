import { NextResponse } from "next/server";
import { managerPath } from "@/lib/manager-auth";

/** App instalável do painel: abre direto no endereço secreto. */
export function GET() {
  const base = managerPath();
  if (!base) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(
    {
      name: "Brida · Painel do Studio",
      short_name: "Brida Painel",
      start_url: `${base}#agenda`,
      scope: `${base}`,
      display: "standalone",
      background_color: "#0b0a09",
      theme_color: "#0b0a09",
      icons: [192, 512].map((s) => ({ src: `${base}/icone/${s}`, sizes: `${s}x${s}`, type: "image/png", purpose: "any maskable" })),
    },
    { headers: { "Content-Type": "application/manifest+json", "X-Robots-Tag": "noindex" } },
  );
}
