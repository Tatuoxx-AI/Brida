import "server-only";
import { one, query } from "@/lib/db";
import type { BusinessHoursRow, SalonSettingsRow, ServiceCategory } from "@/types/database";

// Conteúdo da landing, lido da base (editável no painel → Editar site).
// Se a base falhar, cai para FALLBACK para o site nunca aparecer em branco.

export type SiteService = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  duration: number | null;
  addon: boolean;
};
export type SiteServiceGroup = { key: string; label: string; items: SiteService[] };
export type SiteGalleryItem = { title: string; before: string; after: string };
export type SiteReview = { name: string; rating: number; text: string };
export type SiteHours = { label: string; value: string }[];
export type SiteStaff = { id: string; name: string; avatar: string | null; serviceIds: string[] };

export type SiteData = {
  name: string;
  tagline: string;
  about: string;
  phone: string;
  whatsapp: string;
  address: string;
  mapsEmbedUrl: string;
  mapsUrl: string;
  instagramUrl: string | null;
  facebookUrl: string | null;
  googleRating: number;
  googleReviews: number;
  hours: SiteHours;
  /** primeira abertura e último fecho da semana, para a grelha da agenda */
  hoursRange: { open: number; close: number };
  services: SiteServiceGroup[];
  staff: SiteStaff[];
  gallery: SiteGalleryItem[];
  reviews: SiteReview[];
  assistant: { name: string; greeting: string };
};

const FALLBACK: SiteData = {
  name: "Brida Coiffeur By Claudia Rocha",
  tagline: "Cabelo, unhas e sobrancelhas em Portimão",
  about:
    "Com 25 anos de experiência no setor da beleza, a Claudia Rocha trouxe a sua técnica e paixão para Portugal há 6 anos. " +
    "Especialização académica em tricologia pela USP e formação em Londres garantem um atendimento técnico e estético de excelência.",
  phone: "+351965809800",
  whatsapp: "+351965809800",
  address: "Edifício Fábrica, Av. Guanaré, Loja O, 8500-802 Portimão",
  mapsEmbedUrl: "https://www.google.com/maps?q=Brida+Coiffeur+By+Claudia+Rocha+Portim%C3%A3o&output=embed",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Brida+Coiffeur+By+Claudia+Rocha+Portim%C3%A3o",
  instagramUrl: null,
  facebookUrl: null,
  googleRating: 4.8,
  googleReviews: 40,
  hours: [
    { label: "Segunda a sábado", value: "09:00 – 19:00" },
    { label: "Domingo", value: "Fechado" },
  ],
  hoursRange: { open: 9, close: 19 },
  services: [],
  staff: [],
  gallery: [
    { title: "Madeixas", before: "/fotos/antes-1.jpg", after: "/fotos/depois-1.jpg" },
    { title: "Alisamento", before: "/fotos/antes-2.jpg", after: "/fotos/depois-2.jpg" },
    { title: "Coloração", before: "/fotos/antes-3.jpg", after: "/fotos/depois-3.jpg" },
  ],
  // Opiniões públicas do Google (nome abreviado).
  reviews: [
    {
      name: "Adriana B.",
      rating: 5,
      text: "A Claudia tem umas mãos de fada ✨ Serviço fantástico, as madeixas ficam maravilhosas e o cabelo fica tratado.",
    },
    { name: "Susana D.", rating: 5, text: "Adoro o trabalho de todas as meninas que trabalham no Brida, são bastante profissionais e cuidadosas." },
    { name: "Kostiantyn K.", rating: 5, text: "A minha filha fez alisamento de cabelo e ficou top 👍🏻" },
  ],
  assistant: { name: "Brida Chat", greeting: "Olá! Sou o Brida Chat, o assistente do Brida Coiffeur ✨ Posso ajudar com horários, serviços e marcações — a qualquer hora." },
};

const GROUP_OF: Record<ServiceCategory, { key: string; label: string }> = {
  corte: { key: "cabelo", label: "Cabelo" },
  coloracao: { key: "cabelo", label: "Cabelo" },
  tratamento: { key: "cabelo", label: "Cabelo" },
  penteado: { key: "cabelo", label: "Cabelo" },
  barbearia: { key: "barbearia", label: "Barbearia" },
  unhas: { key: "unhas", label: "Unhas" },
  sobrancelhas: { key: "sobrancelhas", label: "Sobrancelhas" },
  estetica: { key: "estetica", label: "Estética" },
};

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Junta dias seguidos com o mesmo horário: "Segunda a sábado · 09:00 – 19:00". */
function groupHours(rows: BusinessHoursRow[]): SiteHours {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const value = (r?: BusinessHoursRow) => (!r || r.is_closed ? "Fechado" : `${r.opens_at?.slice(0, 5)} – ${r.closes_at?.slice(0, 5)}`);
  const out: { from: number; to: number; value: string }[] = [];
  for (const d of order) {
    const v = value(rows.find((r) => r.weekday === d));
    const last = out.at(-1);
    if (last && last.value === v) last.to = d;
    else out.push({ from: d, to: d, value: v });
  }
  return out.map((g) => ({
    label: g.from === g.to ? DAY_NAMES[g.from] : `${DAY_NAMES[g.from]} a ${DAY_NAMES[g.to].toLowerCase()}`,
    value: g.value,
  }));
}

export async function getSiteData(): Promise<SiteData> {
  try {
    const [s, hours, services, staff, gallery, reviews] = await Promise.all([
      one<SalonSettingsRow>(`select * from public.salon_settings where id = 1`),
      query<BusinessHoursRow>(`select * from public.business_hours order by weekday`),
      query<{ id: string; name: string; description: string | null; category: ServiceCategory; price: number; duration_minutes: number; is_addon: boolean }>(
        `select id, name, description, category, price, duration_minutes, is_addon from public.services where active order by sort_order, name`,
      ),
      query<{ id: string; name: string; avatar_url: string | null; service_ids: string[] }>(
        `select id, name, avatar_url, service_ids from public.public_staff order by name`,
      ),
      query<{ title: string | null; before_url: string | null; after_url: string }>(
        `select title, before_url, after_url from public.gallery_items where published and before_url is not null order by sort_order limit 6`,
      ),
      query<{ rating: number; feedback: string | null; name: string | null }>(
        `select r.rating, r.feedback, p.name from public.reviews r left join public.profiles p on p.id = r.client_id
          where r.published order by r.created_at desc limit 6`,
      ),
    ]);

    const groups: SiteServiceGroup[] = [];
    for (const sv of services) {
      const g = GROUP_OF[sv.category];
      let group = groups.find((x) => x.key === g.key);
      if (!group) groups.push((group = { ...g, items: [] }));
      group.items.push({
        id: sv.id,
        name: sv.name,
        description: sv.description,
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
      : FALLBACK.hoursRange;

    return {
      ...FALLBACK,
      name: s?.name ?? FALLBACK.name,
      tagline: s?.tagline ?? FALLBACK.tagline,
      about: s?.about ?? FALLBACK.about,
      phone: s?.phone ?? FALLBACK.phone,
      whatsapp: s?.whatsapp ?? FALLBACK.whatsapp,
      address: s?.address ?? FALLBACK.address,
      mapsEmbedUrl: s?.maps_embed_url ?? FALLBACK.mapsEmbedUrl,
      instagramUrl: s?.instagram_url ?? null,
      facebookUrl: s?.facebook_url ?? null,
      hours: groupHours(hours),
      hoursRange,
      services: groups,
      staff: staff.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar_url, serviceIds: p.service_ids })),
      gallery: gallery.length
        ? gallery.map((g) => ({ title: g.title ?? "", before: g.before_url!, after: g.after_url }))
        : FALLBACK.gallery,
      reviews: reviews.length
        ? reviews.map((r) => ({ name: abbreviate(r.name ?? "Cliente"), rating: r.rating, text: r.feedback ?? "" }))
        : FALLBACK.reviews,
      assistant: { name: s?.assistant_name ?? FALLBACK.assistant.name, greeting: s?.assistant_greeting ?? FALLBACK.assistant.greeting },
    };
  } catch (e) {
    console.error("[site-data]", e);
    return FALLBACK;
  }
}

const abbreviate = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)![0]}.` : first;
};
