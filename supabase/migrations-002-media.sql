-- Fotos do site carregadas pelo painel (topo, "Sobre", antes & depois).
-- Guardadas na base (já reduzidas no browser) e servidas em /media/<id>.
create table if not exists public.media (
  id         uuid primary key default gen_random_uuid(),
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data       bytea not null,
  bytes      int not null check (bytes > 0 and bytes <= 4194304),
  width      int,
  height     int,
  created_at timestamptz not null default now()
);
alter table public.media enable row level security;
revoke all on table public.media from anon, authenticated;

alter table public.salon_settings add column if not exists hero_image_url text;
alter table public.salon_settings add column if not exists about_image_url text;
