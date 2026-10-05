-- Faixa "Trabalhamos com as melhores marcas": logótipos das marcas de produtos usadas no salão.
-- Lista ordenada [{ id, name, logo: "/media/<id>", w, h }] gerida no painel (Editar site → Marcas).
alter table public.salon_settings add column if not exists brands jsonb not null default '[]'::jsonb;
