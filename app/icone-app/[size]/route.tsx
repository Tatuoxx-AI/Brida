import { ImageResponse } from "next/og";

/** Ícone do site como app (monograma "B" champanhe sobre carvão). */
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  const size = [180, 192, 512].includes(n) ? n : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 30% 20%, #3a2f1c, #141210 72%)",
          color: "#e2c48e",
          fontFamily: "serif",
        }}
      >
        <div style={{ fontSize: size * 0.5, fontStyle: "italic", lineHeight: 1 }}>B</div>
        <div style={{ fontSize: size * 0.075, letterSpacing: size * 0.02, marginTop: size * 0.03, opacity: 0.8 }}>BRIDA</div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
