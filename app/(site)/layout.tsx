import Link from "next/link";
import { AiBookingWidget } from "@/components/ai/AiBookingWidget";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ScrollVeins } from "@/components/site/ScrollVeins";
import { LanguageGate } from "@/components/site/LanguageGate";
import { getSiteData } from "@/lib/site-data";
import { getLocale, hasChosenLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { formatPhone, whatsappLink } from "@/lib/format";

// Portal do cliente: tema escuro (preto + champanhe), idioma do aparelho, cabeçalho,
// rodapé e chat de IA. Todos os textos vêm do conteúdo editável no painel.
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [locale, chosen] = await Promise.all([getLocale(), hasChosenLocale()]);
  const site = await getSiteData(locale);
  const c = site.content;
  const year = new Date().getFullYear();
  const wa = whatsappLink(site.whatsapp, c.whatsappMessage);

  return (
    <I18nProvider locale={locale}>
      <div className="dark grain min-h-dvh bg-background text-foreground">
        <ScrollVeins />
        <SiteHeader phone={site.phone} brandName={c.brandName} brandSub={c.brandSub} />
        <div className="relative z-[1]">{children}</div>

        <footer className="relative z-[1] border-t border-border">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="font-serif text-4xl">{c.brandName}</p>
              <p className="font-label text-[10px] tracking-[0.35em] text-accent uppercase">{c.brandSub}</p>
              {site.tagline && <p className="mt-4 max-w-sm text-sm text-muted-foreground">{site.tagline}</p>}
              {(site.instagramUrl || site.facebookUrl) && (
                <div className="mt-4 flex gap-4 text-sm">
                  {site.instagramUrl && (
                    <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                      Instagram
                    </a>
                  )}
                  {site.facebookUrl && (
                    <a href={site.facebookUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                      Facebook
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="text-sm">
              <p className="mb-3 font-label text-[11px] tracking-[0.25em] text-muted-foreground uppercase">{c.footerVisit}</p>
              <p>{site.address}</p>
              <a href={site.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-accent hover:underline">
                {c.footerOpenMap}
              </a>
            </div>
            <div className="text-sm">
              <p className="mb-3 font-label text-[11px] tracking-[0.25em] text-muted-foreground uppercase">{c.footerTalk}</p>
              <a href={`tel:${site.phone}`} className="block hover:text-accent">
                {formatPhone(site.phone)}
              </a>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-1 block hover:text-accent">
                WhatsApp
              </a>
            </div>
          </div>
          <div className="border-t border-border">
            <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-8">
              <p>
                © {year} {site.name}
              </p>
              <Link href="/perfil" className="hover:text-accent">
                {c.footerProfile}
              </Link>
            </div>
          </div>
        </footer>

        <AiBookingWidget assistantName={site.assistant.name} greeting={site.assistant.greeting} salonWhatsappUrl={wa} />
        <LanguageGate open={!chosen} />
      </div>
    </I18nProvider>
  );
}
