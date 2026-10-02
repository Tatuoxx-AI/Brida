import "server-only";
import { one, query } from "@/lib/db";
import type { BusinessHoursRow, SalonSettingsRow, ServiceCategory } from "@/types/database";
import { DEFAULT_CONTENT, NEUTRAL_KEYS, type ContentKey, type SiteContent } from "@/lib/i18n/content";
import { UI } from "@/lib/i18n/ui";
import type { Locale } from "@/lib/i18n/locales";

// Conteúdo do site num idioma: textos de origem dessa língua ← o que a dona alterou
// no painel (ou a tradução automática disso) ← dados do negócio, serviços e horário.

export type SiteService = { id: string; name: string; description: string | null; price: number | null; duration: number | null; addon: boolean };
export type SiteServiceGroup = { key: string; label: string; items: SiteService[] };
export type SiteGalleryItem = { id: string; title: string; before: string | null; after: string | null };
export type SiteHours = { label: string; value: string }[];
export type SiteStaff = { id: string; name: string; avatar: string | null; serviceIds: string[] };

export type SiteData = {
  locale: Locale;
  name: string;
  phone: string;
  whatsapp: string;
  address: string;
  mapsEmbedUrl: string;
  mapsUrl: string;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tagline: string;
  hours: SiteHours;
  hoursRange: { open: number; close: number };
  heroImage: string;
  aboutImage: string;
  services: SiteServiceGroup[];
  staff: SiteStaff[];
  gallery: SiteGalleryItem[];
  content: SiteContent;
  /** nota numérica do Google, para as estrelas */
  rating: number;
  assistant: { name: string; greeting: string };
};

const GROUP_OF: Record<ServiceCategory, string> = {
  corte: "cabelo",
  coloracao: "cabelo",
  tratamento: "cabelo",
  penteado: "cabelo",
  barbearia: "barbearia",
  unhas: "unhas",
  sobrancelhas: "sobrancelhas",
  estetica: "estetica",
};

/** Junta dias seguidos com o mesmo horário: "Segunda a sábado · 09:00 – 19:00". */
function groupHours(rows: BusinessHoursRow[], locale: Locale): SiteHours {
  const t = UI[locale];
  const order = [1, 2, 3, 4, 5, 6, 0];
  const value = (r?: BusinessHoursRow) => (!r || r.is_closed ? t.closed : `${r.opens_at?.slice(0, 5)} – ${r.closes_at?.slice(0, 5)}`);
  const out: { from: number; to: number; value: string }[] = [];
  for (const d of order) {
    const v = value(rows.find((r) => r.weekday === d));
    const last = out.at(-1);
    if (last && last.value === v) last.to = d;
    else out.push({ from: d, to: d, value: v });
  }
  return out.map((g) => ({ label: g.from === g.to ? t.days[g.from] : t.dayRange(t.days[g.from], t.days[g.to]), value: g.value }));
}

/** Textos do site no idioma pedido. */
export function resolveContent(
  locale: Locale,
  overrides: Partial<SiteContent>,
  i18n: Partial<Record<Locale, Partial<SiteContent>>>,
): SiteContent {
  const out: SiteContent = { ...DEFAULT_CONTENT[locale] };
  for (const key of Object.keys(overrides) as ContentKey[]) {
    const pt = overrides[key];
    if (pt === undefined) continue;
    const value = locale === "pt" || NEUTRAL_KEYS.includes(key) ? pt : (i18n[locale]?.[key] ?? pt);
    (out as Record<ContentKey, unknown>)[key] = value;
  }
  return out;
}

const parseRating = (v: string) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 5;
};

export async function getSiteData(locale: Locale = "pt"): Promise<SiteData> {
  const [s, hours, services, staff, gallery] = await Promise.all([
    one<SalonSettingsRow & { content: Partial<SiteContent>; content_i18n: Partial<Record<Locale, Partial<SiteContent>>> }>(
      `select * from public.salon_settings where id = 1`,
    ),
    query<BusinessHoursRow>(`select * from public.business_hours order by weekday`),
    query<{
      id: string;
      name: string;
      description: string | null;
      category: ServiceCategory;
      price: number;
      duration_minutes: number;
      is_addon: boolean;
      i18n: Partial<Record<Locale, { name?: string; description?: string }>>;
    }>(`select id, name, description, category, price, duration_minutes, is_addon, i18n from public.services where active order by sort_order, name`),
    query<{ id: string; name: string; avatar_url: string | null; service_ids: string[] }>(
      `select id, name, avatar_url, service_ids from public.public_staff order by name`,
    ),
    query<{ id: string; title: string | null; before_url: string | null; after_url: string | null; i18n: Partial<Record<Locale, string>> }>(
      `select id, title, before_url, after_url, i18n from public.gallery_items where published order by sort_order, created_at`,
    ),
  ]);

  const t = UI[locale];
  const overrides = s?.content ?? {};
  const i18n = s?.content_i18n ?? {};
  const content = resolveContent(locale, overrides, i18n);

  const groups: SiteServiceGroup[] = [];
  for (const sv of services) {
    const key = GROUP_OF[sv.category];
    let group = groups.find((x) => x.key === key);
    if (!group) groups.push((group = { key, label: t.groups[key] ?? key, items: [] }));
    const tr = locale === "pt" ? undefined : sv.i18n?.[locale];
    group.items.push({
      id: sv.id,
      name: tr?.name || sv.name,
      description: (tr?.description || sv.description) ?? null,
      price: sv.price > 0 ? sv.price : null,
      duration: sv.duration_minutes,
      addon: sv.is_addon,
    });
  }

  const open = hours.filter((h) => !h.is_closed && h.opens_at && h.closes_at);
  const hoursRange = open.length
    ? {
        open: Math.min(...open.map((h) => Number(h.opens_at!.slice(0, 2)))),
        close: Math.max(...open.map((h) => Math.ceil(Number(h.closes_at!.slice(0, 2)) + Number(h.closes_at!.slice(3, 5)) / 60))),
      }
    : { open: 9, close: 19 };

  // saudação: a da dona (pt) → tradução dela, ou o texto de origem da língua se ela não a mudou
  const ptGreeting = s?.assistant_greeting ?? DEFAULT_CONTENT.pt.assistantGreeting;
  const greeting =
    locale === "pt"
      ? ptGreeting
      : ptGreeting === DEFAULT_CONTENT.pt.assistantGreeting
        ? DEFAULT_CONTENT[locale].assistantGreeting
        : (i18n[locale]?.assistantGreeting ?? ptGreeting);

  const mapsQuery = encodeURIComponent(s?.name ?? "Brida Coiffeur Portimão");
  return {
    locale,
    name: s?.name ?? "Brida Coiffeur By Claudia Rocha",
    phone: s?.phone ?? "+351965809800",
    whatsapp: s?.whatsapp ?? s?.phone ?? "+351965809800",
    address: s?.address ?? "",
    mapsEmbedUrl: s?.maps_embed_url ?? `https://www.google.com/maps?q=${mapsQuery}&output=embed`,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`,
    instagramUrl: s?.instagram_url ?? null,
    facebookUrl: s?.facebook_url ?? null,
    tagline: s?.tagline ?? "",
    hours: groupHours(hours, locale),
    hoursRange,
    heroImage: s?.hero_image_url ?? "/fotos/hero.jpg",
    aboutImage: s?.about_image_url ?? "/fotos/claudia.jpg",
    services: groups,
    staff: staff.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar_url, serviceIds: p.service_ids })),
    gallery: gallery.map((g, i) => ({
      id: g.id,
      title: (locale !== "pt" && g.i18n?.[locale]) || g.title || "",
      before: g.before_url ?? `/fotos/antes-${i + 1}.jpg`,
      after: g.after_url ?? `/fotos/depois-${i + 1}.jpg`,
    })),
    content,
    rating: parseRating(content.ratingValue),
    assistant: { name: s?.assistant_name ?? "Brida Chat", greeting },
  };
}
