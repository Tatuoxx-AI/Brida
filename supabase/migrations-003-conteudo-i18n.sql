-- Textos do site editáveis no painel + traduções automáticas; antes & depois sem foto obrigatória.

-- textos alterados pela dona (português) e as respetivas traduções {en:{…}, fr:{…}, es:{…}, de:{…}}
alter table public.salon_settings add column if not exists content jsonb not null default '{}';
alter table public.salon_settings add column if not exists content_i18n jsonb not null default '{}';
-- nome/descrição dos serviços noutras línguas {en:{name,description}, …}
alter table public.services add column if not exists i18n jsonb not null default '{}';

-- um par antes & depois pode existir antes de ter fotos (aparece como espaço reservado)
alter table public.gallery_items alter column after_url drop not null;

insert into public.gallery_items (title, sort_order)
select t, o from (values ('Madeixas', 10), ('Alisamento', 20), ('Coloração', 30)) v(t, o)
where not exists (select 1 from public.gallery_items);

-- título dos pares antes & depois noutras línguas {en:"Highlights", …}
alter table public.gallery_items add column if not exists i18n jsonb not null default '{}';
