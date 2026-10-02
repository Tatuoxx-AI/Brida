import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { managerPath } from "@/lib/manager-auth";

// Painel do gerente. Só é servido pelo endereço secreto (ver middleware.ts).
export async function generateMetadata(): Promise<Metadata> {
  const base = managerPath();
  return {
    title: { absolute: "Painel do Studio" },
    robots: { index: false, follow: false, nocache: true },
    manifest: base ? `${base}/manifest.webmanifest` : undefined,
    appleWebApp: { capable: true, title: "Brida · Painel", statusBarStyle: "black-translucent" },
    icons: base ? { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: `${base}/icone/180` } : { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = { themeColor: "#0b0a09" };
export const dynamic = "force-dynamic";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  if (!managerPath() || !process.env.MANAGER_PASSWORD) notFound();
  return <div className="dark">{children}</div>;
}
