"use client";

import { useState } from "react";
import { Check, Copy, Download, Gift, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { InviteLadder as Ladder } from "@/lib/invite";

/**
 * Escada de convites no perfil da cliente: QR, código, degraus e lista de quem
 * já convidou.
 *
 * O QR é uma imagem servida pelo servidor (/convite/<código>/qr) e não um
 * desenho feito aqui: assim o mesmo ficheiro serve para ver no ecrã, para
 * descarregar e para partilhar, e o telemóvel sabe mandá-lo para o WhatsApp
 * ou para o Instagram sem mais nada.
 */
export function InviteLadder({ ladder }: { ladder: Ladder }) {
  const t = useT().invite;
  const [copiado, setCopiado] = useState(false);
  const qrSrc = `/convite/${ladder.code}/qr`;

  async function partilhar() {
    const texto = `${t.shareText}\n${ladder.url}`;
    // No telemóvel, o menu nativo cobre WhatsApp, Instagram, mensagens e mais.
    // Tenta-se primeiro com a imagem do QR; se o aparelho não aceitar
    // ficheiros, vai só o texto com o link.
    try {
      const ficheiro = await fetch(qrSrc)
        .then((r) => r.blob())
        .then((b) => new File([b], `convite-${ladder.code}.png`, { type: "image/png" }))
        .catch(() => null);
      if (ficheiro && navigator.canShare?.({ files: [ficheiro] })) {
        await navigator.share({ title: t.shareTitle, text: texto, files: [ficheiro] });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: t.shareTitle, text: texto, url: ladder.url });
        return;
      }
    } catch {
      // partilha cancelada pela pessoa — não é erro
      return;
    }
    // Computador sem partilha nativa: WhatsApp Web.
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(ladder.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sem permissão para a área de transferência */
    }
  }

  const degraus = Array.from({ length: ladder.steps }, (_, i) => i + 1);

  return (
    <section className="mt-10 rounded-3xl border border-border bg-card/70 p-6 backdrop-blur sm:p-8">
      <p className="flex items-center gap-2 font-label text-[11px] tracking-[0.2em] text-accent uppercase">
        <Gift className="size-4" /> {t.title}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{t.subtitle(ladder.step, ladder.max)}</p>

      <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="mx-auto w-full max-w-[200px] sm:mx-0">
          <div className="rounded-2xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt={t.qrAlt} width={360} height={360} className="block w-full" />
          </div>
          <p className="mt-3 text-center font-label text-[10px] tracking-[0.25em] text-muted-foreground uppercase">{t.yourCode}</p>
          <p className="text-center font-mono text-lg tracking-[0.2em] text-accent">{ladder.code}</p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={partilhar}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-medium text-black transition hover:brightness-110"
            >
              <Share2 className="size-4" /> {t.share}
            </button>
            <a
              href={qrSrc}
              download={`convite-${ladder.code}.png`}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-accent/40 px-6 text-sm transition hover:border-accent"
            >
              <Download className="size-4" /> {t.download}
            </a>
            <button
              type="button"
              onClick={copiar}
              aria-label={t.copy}
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-border transition hover:border-accent"
            >
              {copiado ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
            </button>
          </div>
          {copiado && <p className="text-xs text-emerald-300">{t.copied}</p>}

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm">
                {ladder.level > 0 ? t.level(ladder.level) : t.levelNone}
                <span className="ml-2 text-muted-foreground">
                  · {t.discountNow}: <b className="text-accent">{ladder.discount}%</b>
                </span>
              </p>
            </div>

            {/* A escada: um degrau por convidada, o atual em destaque. */}
            <ol className="mt-3 flex gap-1" aria-label={t.title}>
              {degraus.map((d) => {
                const feito = d <= ladder.level;
                const atual = d === ladder.level;
                return (
                  <li
                    key={d}
                    title={`${d} → ${Math.min(ladder.max, d * ladder.step)}%`}
                    className={cn(
                      "h-9 flex-1 rounded-md border text-center text-[10px] leading-9 transition",
                      feito ? "border-accent/60 bg-accent/25 text-accent" : "border-border bg-background/40 text-muted-foreground/50",
                      atual && "ring-2 ring-accent",
                    )}
                  >
                    {Math.min(ladder.max, d * ladder.step)}
                  </li>
                );
              })}
            </ol>

            <p className="mt-3 text-sm">
              {ladder.toNext === null ? (
                <span className="text-accent">{t.maxed}</span>
              ) : (
                <span className="text-muted-foreground">{t.toNext(ladder.toNext, ladder.nextDiscount ?? 0)}</span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">{ladder.consumable ? t.consumable : t.applied}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <p className="font-label text-[11px] tracking-[0.2em] text-muted-foreground uppercase">{t.invitees}</p>
        {ladder.invitees.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.noInvitees}</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {ladder.invitees.map((g, i) => (
              <li key={`${g.name}-${i}`} className="flex items-center justify-between gap-3">
                <span>{g.name}</span>
                <span className={cn("text-xs", g.status === "valid" ? "text-emerald-300" : "text-muted-foreground")}>
                  {g.status === "valid" ? `✓ ${t.validLabel}` : t.pendingLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
