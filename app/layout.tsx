import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost, Mulish } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
});
const jost = Jost({ subsets: ["latin"], variable: "--font-jost" });
const mulish = Mulish({ subsets: ["latin"], variable: "--font-mulish" });

export const metadata: Metadata = {
  title: { default: "Brida Coiffeur By Claudia Rocha", template: "%s · Brida Coiffeur" },
  description:
    "Salão de cabeleireiro em Portimão: madeixas, coloração, alisamento, tratamentos tricológicos, unhas e sobrancelhas. Marque online.",
  applicationName: "Brida",
  appleWebApp: { capable: true, title: "Brida", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icone-app/192", type: "image/png", sizes: "192x192" },
    ],
    apple: "/icone-app/180",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#141210", viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${cormorant.variable} ${jost.variable} ${mulish.variable}`}>
      <body>{children}</body>
    </html>
  );
}
