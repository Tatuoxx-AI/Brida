-- Secção "A nossa equipa": cargo, redes sociais e traduções de cada profissional.
alter table public.profiles add column if not exists job_title text;                     -- ex.: "Fundadora & cabeleireira"
alter table public.profiles add column if not exists socials jsonb not null default '{}'; -- {instagram, facebook, tiktok}
alter table public.profiles add column if not exists i18n jsonb not null default '{}';    -- {en:{job_title}, …}
alter table public.profiles add column if not exists team_order int not null default 0;

-- a vista pública ganha só dados de apresentação (nada de contactos ou comissões)
create or replace view public.public_staff as
select p.id, p.name, p.avatar_url, p.bio, p.calendar_color,
       coalesce(array_agg(ss.service_id) filter (where ss.service_id is not null), '{}') as service_ids,
       p.job_title, p.socials, p.i18n, p.team_order
  from public.profiles p
  left join public.staff_services ss on ss.staff_id = p.id
 where p.role in ('staff', 'admin') and p.active
 group by p.id;

update public.profiles
   set job_title = 'Fundadora & cabeleireira',
       i18n = '{"en":{"job_title":"Founder & hairstylist"},"fr":{"job_title":"Fondatrice & coiffeuse"},"es":{"job_title":"Fundadora y peluquera"},"de":{"job_title":"Gründerin & Friseurin"}}'
 where name = 'Claudia Rocha' and job_title is null;
