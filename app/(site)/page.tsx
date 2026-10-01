import { Clock, MapPin, MessageCircle, Phone, Star } from "lucide-react";
import { getSiteData } from "@/lib/site-data";
import { formatPhone, whatsappLink } from "@/lib/format";
import { Photo } from "@/components/site/Photo";
import { BeforeAfter } from "@/components/site/BeforeAfter";
import { ServiceTabs } from "@/components/site/ServiceTabs";
import { OpenChatButton } from "@/components/site/OpenChatButton";
import { Reveal } from "@/components/site/Reveal";
import { WeekAgenda } from "@/components/agenda/WeekAgenda";
import { InlineChat } from "@/components/ai/InlineChat";
import { SecretDot } from "@/components/site/SecretDot";

export const metadata = { title: { absolute: "Brida Coiffeur By Claudia Rocha · Cabeleireiro em Portimão" } };
export const revalidate = 300;

const HIGHLIGHTS = [
  "25 anos de experiência",
  "Tricologia pela USP",
  "Formação em Londres",
  "Madeixas · Coloração · Alisamento",
  "Unhas e sobrancelhas",
  "Portimão",
];

function Eyebrow({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <p
      className={`flex items-center gap-3 font-label text-[11px] tracking-[0.35em] text-accent uppercase ${center ? "justify-center" : ""}`}
    >
      <span className="h-px w-8 bg-accent/60" />
      {children}
      {center && <span className="h-px w-8 bg-accent/60" />}
    </p>
  );
}

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className} aria-label={`${value} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`inline size-3.5 ${i < Math.round(value) ? "fill-accent text-accent" : "text-muted-foreground"}`} />
      ))}
    </span>
  );
}

export default async function Home() {
  const site = await getSiteData();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
  const wa = whatsappLink(site.whatsapp, "Olá! Gostaria de marcar um serviço no Brida Coiffeur.");

  return (
    <main>
      {/* HERO ------------------------------------------------------------- */}
      <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 lg:min-h-dvh lg:pb-24">

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal>
            <Eyebrow>Salão de cabeleireiro · Portimão</Eyebrow>
            <h1 className="mt-6 text-5xl leading-[0.95] font-light sm:text-7xl lg:text-8xl">
              A arte de
              <br />
              <em className="text-accent">cuidar</em> do seu
              <br />
              cabelo
              <SecretDot />
            </h1>
            <p className="mt-8 max-w-lg text-lg text-muted-foreground">
              Madeixas, coloração, alisamento e tratamentos tricológicos pelas mãos da Claudia Rocha — e uma equipa
              dedicada a unhas e sobrancelhas.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <OpenChatButton>Marcar online</OpenChatButton>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-foreground/30 px-7 font-label text-xs tracking-[0.2em] uppercase transition hover:border-accent hover:text-accent"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </div>
            <a
              href="#opinioes"
              className="mt-10 inline-flex items-center gap-3 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <span className="font-serif text-3xl text-foreground">{site.googleRating.toFixed(1).replace(".", ",")}</span>
              <span>
                <Stars value={site.googleRating} />
                <br />
                {site.googleReviews} opiniões no Google
              </span>
            </a>
          </Reveal>

          <Reveal delay={150} className="relative">
            <div className="relative mx-auto aspect-[3/4] max-w-md overflow-hidden rounded-t-[12rem] rounded-b-3xl border border-border lg:max-w-none">
              <Photo src="/fotos/hero.jpg" alt="Cabelo trabalhado no Brida Coiffeur" label="Foto principal" priority className="size-full" />
            </div>
            <div className="absolute -bottom-6 left-0 hidden rounded-2xl border border-border bg-card/90 px-5 py-4 backdrop-blur sm:block lg:-left-10">
              <p className="font-serif text-4xl text-accent">25</p>
              <p className="font-label text-[10px] tracking-[0.25em] text-muted-foreground uppercase">anos de experiência</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAIXA --------------------------------------------------------------- */}
      <div className="overflow-hidden border-y border-border py-5" aria-hidden>
        <div className="marquee flex w-max gap-12 whitespace-nowrap">
          {[...HIGHLIGHTS, ...HIGHLIGHTS].map((h, i) => (
            <span key={i} className="flex items-center gap-12 font-serif text-2xl text-foreground/70 italic">
              {h} <span className="text-accent not-italic">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* SERVIÇOS ------------------------------------------------------------ */}
      <section id="servicos" className="mx-auto max-w-7xl px-4 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <Eyebrow>Serviços</Eyebrow>
            <h2 className="mt-6 text-5xl leading-tight font-light sm:text-6xl">
              Tratamentos
              <br />
              <em className="text-accent">à sua medida</em>
            </h2>
            <p className="mt-6 max-w-sm text-muted-foreground">
              Cada cabelo começa com um diagnóstico. Escolha o serviço, veja as vagas em tempo real e marque em
              segundos com a nossa assistente.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <ServiceTabs groups={site.services} />
          </Reveal>
        </div>
      </section>

      {/* ANTES / DEPOIS ------------------------------------------------------ */}
      <section id="trabalhos" className="border-y border-border bg-card/40 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>Antes & depois</Eyebrow>
              <h2 className="mt-6 text-5xl font-light sm:text-6xl">
                Resultados que <em className="text-accent">falam</em>
              </h2>
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">Arraste a linha para comparar.</p>
          </Reveal>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {site.gallery.map((g, i) => (
              <Reveal key={g.after} delay={i * 100}>
                <BeforeAfter before={g.before} after={g.after} title={g.title} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SOBRE --------------------------------------------------------------- */}
      <section id="sobre" className="mx-auto max-w-7xl px-4 py-24 sm:px-8 lg:py-32">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal className="relative order-2 lg:order-1">
            <div className="mx-auto aspect-[4/5] max-w-md overflow-hidden rounded-3xl border border-border lg:max-w-none">
              <Photo src="/fotos/claudia.jpg" alt="Claudia Rocha, cabeleireira" label="Claudia Rocha" className="size-full" />
            </div>
            <div className="absolute right-0 -bottom-6 max-w-[16rem] sm:right-[max(0px,calc(50%-14rem-2rem))] lg:-right-8 rounded-2xl border border-accent/40 bg-background/90 p-5 backdrop-blur sm:-right-8">
              <p className="font-label text-[10px] tracking-[0.25em] text-accent uppercase">Especialista</p>
              <p className="mt-1 font-serif text-xl leading-snug">Tricologia e saúde do couro cabeludo</p>
            </div>
          </Reveal>
          <Reveal delay={120} className="order-1 lg:order-2">
            <Eyebrow>Sobre nós</Eyebrow>
            <h2 className="mt-6 text-5xl leading-tight font-light sm:text-6xl">
              Claudia <em className="text-accent">Rocha</em>
            </h2>
            <p className="mt-8 text-lg leading-relaxed text-muted-foreground">{site.about}</p>
            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-8">
              {[
                ["25", "anos de experiência"],
                ["USP", "especialização em tricologia"],
                ["Londres", "formação internacional"],
              ].map(([n, l]) => (
                <div key={l}>
                  <dt className="font-serif text-3xl text-accent sm:text-4xl">{n}</dt>
                  <dd className="mt-1 text-xs text-muted-foreground">{l}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* OPINIÕES ------------------------------------------------------------ */}
      <section id="opinioes" className="border-y border-border bg-card/40 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <Reveal className="text-center">
            <Eyebrow center>Opiniões</Eyebrow>
            <h2 className="mt-6 text-5xl font-light sm:text-6xl">
              {site.googleRating.toFixed(1).replace(".", ",")} <em className="text-accent">no Google</em>
            </h2>
            <p className="mt-3 text-muted-foreground">
              <Stars value={site.googleRating} /> · {site.googleReviews} opiniões
            </p>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {site.reviews.slice(0, 3).map((r, i) => (
              <Reveal key={r.name} delay={i * 100}>
                <figure className="flex h-full flex-col rounded-3xl border border-border bg-background p-8">
                  <span className="font-serif text-6xl leading-none text-accent/60">“</span>
                  <blockquote className="mt-2 flex-1 font-serif text-xl leading-snug">{r.text}</blockquote>
                  <figcaption className="mt-6 flex items-center justify-between border-t border-border pt-5 text-sm">
                    <span>{r.name}</span>
                    <Stars value={r.rating} />
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* AGENDA + ASSISTENTE --------------------------------------------- */}
      <section id="agenda" className="relative py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <Reveal className="mb-14 text-center">
            <Eyebrow center>Agenda online</Eyebrow>
            <h2 className="mt-6 text-5xl font-light sm:text-6xl">
              Reserve o seu <em className="text-accent">momento</em>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Escolha o serviço e a hora na agenda, ou pergunte no {site.assistant.name}, aqui ao lado. Sem pagamentos online:
              a marcação confirma-se pelo WhatsApp.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="grid items-stretch gap-6 lg:grid-cols-[1.45fr_1fr]">
              <WeekAgenda groups={site.services} staff={site.staff} hoursRange={site.hoursRange} today={today} />
              <InlineChat
                assistantName={site.assistant.name}
                greeting={site.assistant.greeting}
                salonWhatsappUrl={whatsappLink(site.whatsapp, "Olá! Gostaria de falar com o salão.")}
                className="h-[640px] lg:h-auto lg:min-h-[640px]"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* CONTACTO ------------------------------------------------------------ */}
      <section id="contacto" className="mx-auto max-w-7xl px-4 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <Eyebrow>Contacto</Eyebrow>
            <h2 className="mt-6 text-5xl leading-tight font-light sm:text-6xl">
              Venha <em className="text-accent">visitar-nos</em>
            </h2>
            <ul className="mt-10 space-y-6">
              <li className="flex gap-4">
                <MapPin className="mt-1 size-5 shrink-0 text-accent" />
                <div>
                  <p>{site.address}</p>
                  <a href={site.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">
                    Como chegar
                  </a>
                </div>
              </li>
              <li className="flex gap-4">
                <Phone className="mt-1 size-5 shrink-0 text-accent" />
                <a href={`tel:${site.phone}`} className="hover:text-accent">
                  {formatPhone(site.phone)}
                </a>
              </li>
              <li className="flex gap-4">
                <Clock className="mt-1 size-5 shrink-0 text-accent" />
                <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1">
                  {site.hours.map((h) => (
                    <div key={h.label} className="contents">
                      <dt className="text-muted-foreground">{h.label}</dt>
                      <dd>{h.value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            </ul>
            <div className="mt-10 flex flex-wrap gap-3">
              <OpenChatButton>Marcar online</OpenChatButton>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#25D366] px-7 font-label text-xs tracking-[0.2em] text-white uppercase transition hover:brightness-95"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="h-full min-h-80 overflow-hidden rounded-3xl border border-border">
              <iframe
                title={`Mapa — ${site.name}`}
                src={site.mapsEmbedUrl}
                className="size-full min-h-80 grayscale invert-[0.9] hue-rotate-180"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
