"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { mgrAddBrand, mgrBrands, mgrDeleteBrand, mgrMoveBrand, type MgrBrand } from "@/actions/manager";
import { Btn, Card, H2, Label, inputCls, useFlash } from "./ui";

const GOLD = "linear-gradient(180deg, #FFF4CC 0%, #F6CF57 40%, #D9A521 75%, #B07A12 100%)";

/**
 * Prepara o logótipo no browser: reduz para no máx. 600 px e grava em PNG (mantém a
 * transparência). Se a imagem não tiver transparência nenhuma (ex.: JPG com fundo branco),
 * torna o fundo claro transparente — no site o logótipo é recortado pela transparência.
 */
async function prepareLogo(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const px = img.data;
  let transparent = false;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { transparent = true; break; }
  if (!transparent) {
    for (let i = 0; i < px.length; i += 4) {
      const light = Math.min(px[i], px[i + 1], px[i + 2]);
      // branco → transparente, com a borda suave para não ficar serrilhado
      if (light > 235) px[i + 3] = 0;
      else if (light > 200) px[i + 3] = Math.round(((235 - light) / 35) * 255);
    }
    ctx.putImageData(img, 0, 0);
  }
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("falhou"))), "image/png"));
  return { blob, width, height };
}

function GoldLogo({ b, height = 28 }: { b: { logo: string; w: number; h: number; name: string }; height?: number }) {
  const mask = `url("${b.logo}") center / contain no-repeat`;
  return (
    <span
      role="img"
      aria-label={b.name}
      className="block shrink-0"
      style={{ height, width: Math.min(160, Math.round((height * b.w) / b.h)), background: GOLD, mask, WebkitMask: mask }}
    />
  );
}

export function BrandsSection() {
  const [list, setList] = useState<MgrBrand[] | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<{ blob: Blob; width: number; height: number; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const load = useCallback(() => {
    mgrBrands().then(setList);
  }, []);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return flash.show({ ok: false, error: "Escolha o logótipo." });
    setBusy(true);
    const form = new FormData();
    form.append("name", name);
    form.append("logo", new File([file.blob], "logo.png", { type: "image/png" }));
    form.append("logoWidth", String(file.width));
    form.append("logoHeight", String(file.height));
    const r = await mgrAddBrand(form);
    setBusy(false);
    flash.show(r, "Marca adicionada ✓");
    if (r.ok) {
      setName("");
      setFile(null);
      load();
    }
  };

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    if (!r.ok) flash.show(r);
    load();
  };

  return (
    <section className="space-y-4">
      <H2>Marcas</H2>
      <p className="text-sm text-muted-foreground">
        Logótipos das marcas de produtos que usa no salão. Aparecem numa faixa a deslizar no fim do site, pintados a dourado. Use de preferência PNG
        com fundo transparente; se o logótipo tiver fundo branco, o fundo é retirado sozinho. Sem marcas, a faixa não aparece.
      </p>

      {list === null ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : list.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((b, i) => (
            <li key={b.id} className="flex items-center gap-3 rounded-xl border border-gold/15 bg-black px-4 py-3">
              <GoldLogo b={b} />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{b.name}</span>
              <button type="button" aria-label={`Mover ${b.name} para a esquerda`} disabled={i === 0} onClick={() => act(mgrMoveBrand(b.id, -1))} className="p-1 text-gold disabled:opacity-25">
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Mover ${b.name} para a direita`}
                disabled={i === list.length - 1}
                onClick={() => act(mgrMoveBrand(b.id, 1))}
                className="p-1 text-gold disabled:opacity-25"
              >
                <ChevronRight className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Apagar ${b.name}`}
                onClick={() => confirm(`Apagar a marca ${b.name}?`) && act(mgrDeleteBrand(b.id))}
                className="p-1 text-red-300 hover:text-red-200"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Ainda não há marcas.</p>
      )}

      <Card>
        <form onSubmit={add} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="grid h-[50px] w-full cursor-pointer place-items-center rounded-xl border border-dashed border-gold/40 bg-black px-4 sm:w-48">
            {file ? (
              <GoldLogo b={{ logo: file.url, w: file.width, h: file.height, name: "Pré-visualização" }} />
            ) : (
              <span className="flex items-center gap-2 text-xs text-gold">
                <ImagePlus className="size-4" /> Escolher logótipo
              </span>
            )}
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="sr-only"
              aria-label="Logótipo da marca"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const p = await prepareLogo(f);
                  setFile({ ...p, url: URL.createObjectURL(p.blob) });
                  if (!name) setName(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 60));
                } catch {
                  flash.show({ ok: false, error: "Não consegui ler esta imagem." });
                }
              }}
            />
          </label>
          <label className="block flex-1">
            <Label>Nome da marca</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Kérastase" className={inputCls} required />
          </label>
          <Btn type="submit" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Adicionar"}
          </Btn>
        </form>
      </Card>
      {flash.node}
    </section>
  );
}
