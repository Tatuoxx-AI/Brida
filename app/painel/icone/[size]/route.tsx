import { ImageResponse } from "next/og";

/** Ícone da app do painel (monograma B dourado), gerado sem ficheiros. */
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = [180, 192, 512].includes(Number((await params).size)) ? Number((await params).size) : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 30% 20%, #3a2f1c, #0b0a09 70%)",
          color: "#d9b25f",
          fontSize: size * 0.55,
          fontStyle: "italic",
          fontFamily: "serif",
        }}
      >
        B
      </div>
    ),
    { width: size, height: size },
  );
}
