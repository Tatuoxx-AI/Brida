"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mgrAddGalleryItem,
  mgrUpdateGalleryItem,
  mgrDeleteGalleryItem,
  mgrPhotos,
  mgrRemoveSitePhoto,
  mgrSetSitePhoto,
  type MgrPhotos,
} from "@/actions/manager";
import { Btn, Card, H2, Label, inputCls, useFlash } from "./ui";

/** Reduz a foto no browser (máx. 1800 px, JPEG ~85%) para enviar rápido e leve. */
async function shrink(file: File, max = 1800): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("falhou"))), "image/jpeg", 0.85));
  return { blob, width, height };
}

async function addToForm(form: FormData, key: string, file: File) {
  const { blob, width, height } = await shrink(file);
  form.append(key, new File([blob], "foto.jpg", { type: "image/jpeg" }));
  form.append(`${key === "file" ? "" : key}${key === "file" ? "width" : "Width"}`, String(width));
  form.append(`${key === "file" ? "" : key}${key === "file" ? "height" : "Height"}`, String(height));
}

export function PhotosSection() {
  const [data, setData] = useState<MgrPhotos | null>(null);
  const load = useCallback(() => {
    mgrPhotos().then(setData);
  }, []);
  useEffect(load, [load]);

  return (
    <section className="space-y-5">
      <div>
        <H2>Fotos do site</H2>
        <p className="text-sm text-muted-foreground">Toque numa foto para a trocar. As fotos do telemóvel são reduzidas automaticamente.</p>
      </div>
      {!data ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <SlotPhoto slot="hero" title="Foto principal (topo)" url={data.hero} onChange={load} tall />
            <SlotPhoto slot="about" title="Foto da secção “Sobre”" url={data.about} onChange={load} tall />
          </div>
          <Gallery items={data.gallery} onChange={load} />
        </>
      )}
    </section>
  );
}

function SlotPhoto({ slot, title, url, onChange, tall }: { slot: "hero" | "about"; title: string; url: string | null; onChange: () => void; tall?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("slot", slot);
      await addToForm(form, "file", file);
      flash.show(await mgrSetSitePhoto(form), "Foto atualizada no site ✓");
      onChange();
    } catch {
      flash.show({ ok: false, error: "Não foi possível ler essa foto." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card className="space-y-3 p-4 sm:p-4">
      <Label>{title}</Label>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={cn(
          "group relative grid w-full place-items-center overflow-hidden rounded-xl border border-dashed border-gold/40 bg-black/40",
          tall ? "aspect-[4/5]" : "aspect-video",
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- pré-visualização de uma foto do próprio site
          <img src={url} alt={title} className="absolute inset-0 size-full object-cover transition group-hover:opacity-70" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <ImagePlus className="size-8 text-gold" /> Adicionar foto
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-black/60">
            <Loader2 className="size-7 animate-spin text-gold" />
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex items-center gap-2">
        <Btn variant="ghost" className="h-9 px-4" onClick={() => input.current?.click()} disabled={busy}>
          {url ? "Trocar" : "Escolher foto"}
        </Btn>
        {url && (
          <Btn
            variant="danger"
            className="h-9 px-4"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Remover esta foto do site?")) return;
              flash.show(await mgrRemoveSitePhoto(slot), "Foto removida ✓");
              onChange();
            }}
          >
            Remover
          </Btn>
        )}
      </div>
      {flash.node}
    </Card>
  );
}

function Gallery({ items, onChange }: { items: MgrPhotos["gallery"]; onChange: () => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  return (
    <Card className="space-y-4">
      <div>
        <p className="font-medium">Antes & depois</p>
        <p className="text-sm text-muted-foreground">
          Cada par aparece no site com o comparador deslizante. Toque em “Antes” ou “Depois” para pôr a foto; sem foto, o site mostra um espaço reservado.
        </p>
      </div>

      <ul className="space-y-3">
        {items.map((g) => (
          <GalleryItem key={g.id} item={g} onChange={onChange} />
        ))}
      </ul>

      <form
        className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-gold/30 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await mgrAddGalleryItem(title);
          setBusy(false);
          flash.show(r, "Par adicionado ✓ — agora ponha as fotos");
          if (r.ok) {
            setTitle("");
            onChange();
          }
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Novo par — título (ex.: Corte)" className={cn(inputCls, "flex-1")} aria-label="Título do novo par" />
        <Btn type="submit" variant="ghost" disabled={busy}>
          <ImagePlus className="size-4" /> Adicionar par
        </Btn>
        {flash.node}
      </form>
    </Card>
  );
}

function GalleryItem({ item, onChange }: { item: MgrPhotos["gallery"][number]; onChange: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [busy, setBusy] = useState<"before" | "after" | "title" | null>(null);
  const flash = useFlash();

  async function upload(side: "before" | "after", file: File | undefined) {
    if (!file) return;
    setBusy(side);
    try {
      const form = new FormData();
      form.append("id", item.id);
      await addToForm(form, side, file);
      flash.show(await mgrUpdateGalleryItem(form), "Foto atualizada ✓");
      onChange();
    } catch {
      flash.show({ ok: false, error: "Não foi possível ler essa foto." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-xl border border-gold/15 bg-black/30 p-3">
      <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[8rem_8rem_1fr] sm:gap-3">
        {(["before", "after"] as const).map((side) => {
          const url = side === "before" ? item.before : item.after;
          return (
            <label
              key={side}
              className="relative grid aspect-[4/5] cursor-pointer place-items-center overflow-hidden rounded-lg border border-gold/30 bg-black/40 text-xs text-muted-foreground"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- miniatura de uma foto do próprio site
                <img src={url} alt={side === "before" ? "Antes" : "Depois"} className="absolute inset-0 size-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1">
                  <ImagePlus className="size-5 text-gold" /> pôr foto
                </span>
              )}
              <span className="absolute top-1.5 left-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] tracking-[0.15em] text-white uppercase">
                {side === "before" ? "Antes" : "Depois"}
              </span>
              {busy === side && (
                <span className="absolute inset-0 grid place-items-center bg-black/60">
                  <Loader2 className="size-5 animate-spin text-gold" />
                </span>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(side, e.target.files?.[0])} />
            </label>
          );
        })}
        <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} aria-label="Título do par" />
          <div className="flex flex-wrap items-center gap-2">
            {title.trim() !== item.title && (
              <Btn
                className="h-9 px-4"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy("title");
                  const form = new FormData();
                  form.append("id", item.id);
                  form.append("title", title);
                  flash.show(await mgrUpdateGalleryItem(form), "Título guardado ✓");
                  setBusy(null);
                  onChange();
                }}
              >
                Guardar título
              </Btn>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Apagar “${item.title}” do site?`)) return;
                flash.show(await mgrDeleteGalleryItem(item.id), "Apagado ✓");
                onChange();
              }}
              className="ml-auto flex items-center gap-1 text-xs text-red-300 hover:underline"
            >
              <Trash2 className="size-3.5" /> Apagar par
            </button>
          </div>
          {flash.node}
        </div>
      </div>
    </li>
  );
}
