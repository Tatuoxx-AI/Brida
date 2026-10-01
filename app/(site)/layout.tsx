import Link from "next/link";
import { AiBookingWidget } from "@/components/ai/AiBookingWidget";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ScrollVeins } from "@/components/site/ScrollVeins";
import { getSiteData } from "@/lib/site-data";
import { formatPhone, whatsappLink } from "@/lib/format";

// Portal do cliente: tema escuro (preto + champanhe), cabeçalho, rodapé e chat de IA.
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteData();
  const year = new Date().getFullYear();

  return (
    <div className="dark grain min-h-dvh bg-background text-foreground">
      <ScrollVeins />
      <SiteHeader phone={site.phone} />
      <div className="relative z-[1]">{children}</div>

      <footer className="relative z-[1] border-t border-border">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-serif text-4xl">Brida</p>
            <p className="font-label text-[10px] tracking-[0.35em] text-accent uppercase">Coiffeur · Claudia Rocha</p>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">{site.tagline}.</p>
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
            <p className="mb-3 font-label text-[11px] tracking-[0.25em] text-muted-foreground uppercase">Visite-nos</p>
            <p>{site.address}</p>
            <a href={site.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-accent hover:underline">
              Abrir no mapa
            </a>
          </div>
          <div className="text-sm">
            <p className="mb-3 font-label text-[11px] tracking-[0.25em] text-muted-foreground uppercase">Fale connosco</p>
            <a href={`tel:${site.phone}`} className="block hover:text-accent">
              {formatPhone(site.phone)}
            </a>
            <a
              href={whatsappLink(site.whatsapp, "Olá! Gostaria de marcar um serviço.")}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block hover:text-accent"
            >
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
              Área de cliente
            </Link>
          </div>
        </div>
      </footer>

      <AiBookingWidget
        assistantName={site.assistant.name}
        greeting={site.assistant.greeting}
        salonWhatsappUrl={whatsappLink(site.whatsapp, "Olá! Gostaria de falar com o salão.")}
      />
    </div>
  );
}
