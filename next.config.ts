import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Política de conteúdo: só carrega scripts/estilos do próprio site; o único
// iframe permitido é o mapa do Google; formulários só submetem para o próprio site.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "media-src 'self' https://cdn.jiro.build", // vídeo de seda da secção Brida Chat
  `connect-src 'self'${dev ? " ws: wss:" : ""} https://*.supabase.co wss://*.supabase.co`,
  "frame-src https://www.google.com https://maps.google.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false, // não anunciar a tecnologia do servidor
  productionBrowserSourceMaps: false, // o código-fonte não vai para o browser
  // Postgres local em WASM e driver pg ficam fora do bundle (carregados pelo Node)
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // fotos do painel chegam já reduzidas (~0,5 MB); margem para PNG maiores
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  images: {
    // fotos da galeria/produtos servidas pelo Supabase Storage
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
