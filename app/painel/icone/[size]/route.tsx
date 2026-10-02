import { ImageResponse } from "next/og";
import { appIconSvg, svgDataUri } from "@/lib/brand-icon";

/** Ícone de app: B dourado com contorno preto (ver lib/brand-icon.ts). */
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  const size = [180, 192, 512].includes(n) ? n : 192;
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element -- o ImageResponse desenha a partir de um SVG embutido
    <img src={svgDataUri(appIconSvg())} width={size} height={size} alt="" />,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
