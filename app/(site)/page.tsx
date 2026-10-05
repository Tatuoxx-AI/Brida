import { Clock, MapPin, MessageCircle, Phone, Star } from "lucide-react";
import { getSiteData } from "@/lib/site-data";
import { getLocale } from "@/lib/i18n/server";
import { UI } from "@/lib/i18n/ui";
import { formatPhone, whatsappLink } from "@/lib/format";
import { currentClient } from "@/lib/client-session";
import { Photo } from "@/components/site/Photo";
import { BeforeAfter } from "@/components/site/BeforeAfter";
import { ServiceTabs } from "@/components/site/ServiceTabs";
import { OpenChatButton } from "@/components/site/OpenChatButton";
import { Reveal } from "@/components/site/Reveal";
import { WeekAgenda } from "@/components/agenda/WeekAgenda";
import { InlineChat } from "@/components/ai/InlineChat";
import { SecretDot } from "@/components/site/SecretDot";
import { TeamCarousel } from "@/components/site/TeamCarousel";
import { ChatShowcase } from "@/components/site/ChatShowcase";

export const metadata = { title: { absolute: "Brida Coiffeur By Claudia Rocha · Portimão" } };

function Eyebrow({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <p className={`flex items-center gap-3 font-label text-[11px] tracking-[0.35em] text-accent uppercase ${center ? "justify-center" : ""}`}>
      <span className="h-px w-8 bg-accent/60" />
      {children}
      {center && <span className="h-px w-8 bg-accent/60" />}
    </p>
  );
}

function Stars({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span className={className} aria-label={`${value} ${label}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`inline size-3.5 ${i < Math.round(value) ? "fill-accent text-accent" : "text-muted-foreground"}`} />
      ))}
    </span>
  );
}

export default async function Home() {
  const locale = await getLocale();
  const [site, me] = await Promise.all([getSiteData(locale), currentClient()]);
  const c = site.content;
  const t = UI[locale];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
  const wa = whatsappLink(site.whatsapp, c.whatsappMessage);
  const marquee = c.marqueeItems.filter(Boolean);

  return (
    <main>
      {/* HERO ------------------------------------------------------------- */}
      <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 lg:min-h-dvh lg:pb-24">
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-8 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal>
            <Eyebrow>{c.heroEyebrow}</Eyebrow>
            <h1 className="mt-6 text-5xl leading-[0.95] font-light sm:text-7xl lg:text-8xl">
              {c.heroLine1}
              <br />
              <em className="text-accent">{c.heroAccent}</em> {c.heroLine2}
              <br />
              {c.heroLine3}
              <SecretDot />
            </h1>
            <p className="mt-8 max-w-lg text-lg text-muted-foreground">{c.heroSubtitle}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <OpenChatButton>{c.heroCtaBook}</OpenChatButton>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-foreground/30 px-7 font-label text-xs tracking-[0.2em] uppercase transition hover:border-accent hover:text-accent"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </div>
            <a href="#opinioes" className="mt-10 inline-flex items-center gap-3 text-sm text-muted-foreground transition hover:text-foreground">
              <span className="font-serif text-3xl text-foreground">{c.ratingValue}</span>
              <span>
                <Stars value={site.rating} label={t.starsOf5} />
                <br />
                {c.ratingCount} {c.heroRatingLabel}
              </span>
            </a>
          </Reveal>

          <Reveal delay={150} className="relative">
            <div className="relative mx-auto aspect-[3/4] max-w-md overflow-hidden rounded-t-[12rem] rounded-b-3xl border border-border lg:max-w-none">
              <Photo src={site.heroImage} alt={site.name} label={t.photoMain} priority className="size-full" />
            </div>
            {(c.heroBadgeValue || c.heroBadgeLabel) && (
              <div className="absolute -bottom-6 left-0 hidden rounded-2xl border border-border bg-card/90 px-5 py-4 backdrop-blur sm:block lg:-left-10">
                <p className="font-serif text-4xl text-accent">{c.heroBadgeValue}</p>
                <p className="font-label text-[10px] tracking-[0.25em] text-muted-foreground uppercase">{c.heroBadgeLabel}</p>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* FAIXA --------------------------------------------------------------- */}
      {marquee.length > 0 && (
        <div className="overflow-hidden border-y border-border py-5" aria-hidden>
          {/* duas cópias iguais: ao chegar a -50% a 2.ª ocupa o lugar da 1.ª e o ciclo não salta */}
          <div className="marquee flex w-max whitespace-nowrap">
            {[...marquee, ...marquee].map((h, i) => (
              <span key={i} className="flex items-center gap-12 pr-12 font-serif text-2xl text-foreground/70 italic">
                {h} <span className="text-accent not-italic">{c.marqueeSymbol}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SERVIÇOS ------------------------------------------------------------ */}
      <section id="servicos" className="mx-auto max-w-7xl px-4 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <Eyebrow>{c.servicesEyebrow}</Eyebrow>
            <h2 className="mt-6 text-5xl leading-tight font-light sm:text-6xl">
              {c.servicesTitle}
              <br />
              <em className="text-accent">{c.servicesAccent}</em>
            </h2>
            <p className="mt-6 max-w-sm text-muted-foreground">{c.servicesText}</p>
          </Reveal>
          <Reveal delay={120}>
            <ServiceTabs groups={site.services} cta={c.servicesCta} note={c.servicesNote} onRequest={c.servicesOnRequest} />
          </Reveal>
        </div>
      </section>

      {/* ANTES / DEPOIS ------------------------------------------------------ */}
      {site.gallery.length > 0 && (
        <section id="trabalhos" className="border-y border-border bg-card/40 py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-8">
            <Reveal className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Eyebrow>{c.galleryEyebrow}</Eyebrow>
                <h2 className="mt-6 text-5xl font-light sm:text-6xl">
                  {c.galleryTitle} <em className="text-accent">{c.galleryAccent}</em>
                </h2>
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">{c.galleryHint}</p>
            </Reveal>
            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {site.gallery.map((g, i) => (
                <Reveal key={g.id} delay={i * 100}>
                  <BeforeAfter before={g.before ?? ""} after={g.after ?? ""} title={g.title} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SOBRE --------------------------------------------------------------- */}
      <section id="sobre" className="mx-auto max-w-7xl px-4 py-24 sm:px-8 lg:py-32">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal className="relative order-2 lg:order-1">
            <div className="mx-auto aspect-[4/5] max-w-md overflow-hidden rounded-3xl border border-border lg:max-w-none">
              <Photo src={site.aboutImage} alt={`${c.aboutTitle} ${c.aboutAccent}`} label={`${c.aboutTitle} ${c.aboutAccent}`} className="size-full" />
            </div>
            {(c.aboutBadgeLabel || c.aboutBadgeText) && (
              <div className="absolute right-0 -bottom-6 max-w-[16rem] rounded-2xl border border-accent/40 bg-background/90 p-5 backdrop-blur sm:right-[max(0px,calc(50%-14rem-2rem))] lg:-right-8">
                <p className="font-label text-[10px] tracking-[0.25em] text-accent uppercase">{c.aboutBadgeLabel}</p>
                <p className="mt-1 font-serif text-xl leading-snug">{c.aboutBadgeText}</p>
              </div>
            )}
          </Reveal>
          <Reveal delay={120} className="order-1 lg:order-2">
            <Eyebrow>{c.aboutEyebrow}</Eyebrow>
            <h2 className="mt-6 text-5xl leading-tight font-light sm:text-6xl">
              {c.aboutTitle} <em className="text-accent">{c.aboutAccent}</em>
            </h2>
            <p className="mt-8 text-lg leading-relaxed whitespace-pre-line text-muted-foreground">{c.aboutText}</p>
            {c.aboutStats.length > 0 && (
              <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-8">
                {c.aboutStats.slice(0, 3).map((s, i) => (
                  <div key={i}>
                    <dt className="font-serif text-3xl text-accent sm:text-4xl">{s.value}</dt>
                    <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Reveal>
        </div>
      </section>

      {/* EQUIPA -------------------------------------------------------------- */}
      <TeamCarousel members={site.staff} eyebrow={c.teamEyebrow} title={c.teamTitle} accent={c.teamAccent} text={c.teamText} />

      {/* OPINIÕES ------------------------------------------------------------ */}
      <section id="opinioes" className="border-y border-border bg-card/40 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <Reveal className="text-center">
            <Eyebrow center>{c.reviewsEyebrow}</Eyebrow>
            <h2 className="mt-6 text-5xl font-light sm:text-6xl">
              {c.ratingValue} <em className="text-accent">{c.reviewsAccent}</em>
            </h2>
            <p className="mt-3 text-muted-foreground">
              <Stars value={site.rating} label={t.starsOf5} /> · {c.ratingCount} {c.reviewsCountLabel}
            </p>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {c.reviews.slice(0, 6).map((r, i) => (
              <Reveal key={i} delay={i * 100}>
                <figure className="flex h-full flex-col rounded-3xl border border-border bg-background p-8">
                  <span className="font-serif text-6xl leading-none text-accent/60">“</span>
                  <blockquote className="mt-2 flex-1 font-serif text-xl leading-snug">{r.text}</blockquote>
                  <figcaption className="mt-6 flex items-center justify-between border-t border-border pt-5 text-sm">
                    <span>{r.name}</span>
                    <Stars value={r.rating} label={t.starsOf5} />
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
            <Eyebrow center>{c.agendaEyebrow}</Eyebrow>
            <h2 className="mt-6 text-5xl font-light sm:text-6xl">
              {c.agendaTitle} <em className="text-accent">{c.agendaAccent}</em>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">{c.agendaText}</p>
          </Reveal>
          <Reveal delay={120}>
            <div className="grid items-stretch gap-6 lg:grid-cols-[1.45fr_1fr]">
              <WeekAgenda
                groups={site.services}
                staff={site.staff}
                hoursRange={site.hoursRange}
                today={today}
                me={me ? { name: me.name, phone: me.phone } : null}
              />
              <InlineChat
                assistantName={site.assistant.name}
                greeting={site.assistant.greeting}
                salonWhatsappUrl={whatsappLink(site.whatsapp, c.whatsappMessage)}
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
            <Eyebrow>{c.contactEyebrow}</Eyebrow>
            <h2 className="mt-6 text-5xl leading-tight font-light sm:text-6xl">
              {c.contactTitle} <em className="text-accent">{c.contactAccent}</em>
            </h2>
            <ul className="mt-10 space-y-6">
              <li className="flex gap-4">
                <MapPin className="mt-1 size-5 shrink-0 text-accent" />
                <div>
                  <p>{site.address}</p>
                  <a href={site.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">
                    {c.contactDirections}
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
              <OpenChatButton>{c.heroCtaBook}</OpenChatButton>
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
                title={site.name}
                src={site.mapsEmbedUrl}
                className="size-full min-h-80 grayscale invert-[0.9] hue-rotate-180"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* BRIDA CHAT (secção final, preto e dourado) ---------------------- */}
      <ChatShowcase
        assistantName={site.assistant.name}
        title={c.showcaseTitle}
        accent={c.showcaseAccent}
        text={c.showcaseText}
        ctaChat={c.showcaseCtaChat}
        ctaAgenda={c.showcaseCtaAgenda}
      />
    </main>
  );
}
