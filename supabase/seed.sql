-- =============================================================================
-- Dados do Brida Coiffeur By Claudia Rocha. Correr DEPOIS do schema.sql.
-- =============================================================================

update public.salon_settings set
  name              = 'Brida Coiffeur By Claudia Rocha',
  tagline           = 'Cabelo, unhas e sobrancelhas em Portimão',
  area              = 'Portimão · Algarve',
  phone             = '+351965809800',
  whatsapp          = '+351965809800',   -- confirmar se o WhatsApp é o mesmo número
  address           = 'Edifício Fábrica, Av. Guanaré, Loja O, 8500-802 Portimão',
  maps_embed_url    = 'https://www.google.com/maps?q=Brida+Coiffeur+By+Claudia+Rocha+Portim%C3%A3o&output=embed',
  about             = 'Com 25 anos de experiência no setor da beleza, a Claudia Rocha trouxe a sua técnica e paixão '
                      || 'para Portugal há 6 anos. Especialização académica em tricologia pela USP e formação em Londres. '
                      || 'O salão é especializado em cuidados com o cabelo, unhas e sobrancelhas, com tratamentos '
                      || 'personalizados e foco em resultados que fidelizam.',
  timezone          = 'Europe/Lisbon',
  currency          = 'EUR'
where id = 1;

-- -----------------------------------------------------------------------------
-- Serviços: lista de partida. Preço 0 = "sob consulta" no site e na IA.
-- As DURAÇÕES são estimativas — o salão corrige em Painel → Editar site.
-- -----------------------------------------------------------------------------
insert into public.services (name, category, duration_minutes, price, is_addon, sort_order) values
  ('Madeixas',                   'coloracao',   150,  0, false, 10),
  ('Coloração',                  'coloracao',    90,  0, false, 20),
  ('Alisamento',                 'tratamento',  180,  0, false, 30),
  ('Corte',                      'corte',        45,  0, false, 40),
  ('Brushing',                   'penteado',     45,  0, false, 50),
  ('Tratamento tricológico',     'tratamento',   60,  0, false, 60),
  ('Manicure',                   'unhas',        45,  0, false, 70),
  ('Pedicure',                   'unhas',        60,  0, false, 80),
  ('Unhas de gel',               'unhas',        90,  0, false, 90),
  ('Design de sobrancelhas',     'sobrancelhas', 30,  0, false, 100),
  ('Lavagem',                    'tratamento',   15,  0, true,  200),
  ('Hidratação',                 'tratamento',   30,  0, true,  210);

-- Equipa: a Claudia faz todos os serviços. Outras profissionais entram pelo painel.
insert into public.profiles (role, name, bio, calendar_color)
values ('admin', 'Claudia Rocha', '25 anos de experiência · tricologia (USP) · formação em Londres', '#d6b77a');

insert into public.staff_services (staff_id, service_id)
select p.id, s.id from public.profiles p cross join public.services s where p.name = 'Claudia Rocha';

-- Antes & depois: 3 pares à espera das fotos (Painel → Editar site → Fotos)
insert into public.gallery_items (title, sort_order) values ('Madeixas', 10), ('Alisamento', 20), ('Coloração', 30);
-- Traduções dos nomes de origem (serviços e pares antes & depois). Idempotente.
update public.services s set i18n = t.i18n::jsonb from (values
  ('Madeixas',               '{"en":{"name":"Highlights"},"fr":{"name":"Mèches"},"es":{"name":"Mechas"},"de":{"name":"Strähnen"}}'),
  ('Coloração',              '{"en":{"name":"Colour"},"fr":{"name":"Coloration"},"es":{"name":"Coloración"},"de":{"name":"Coloration"}}'),
  ('Alisamento',             '{"en":{"name":"Straightening"},"fr":{"name":"Lissage"},"es":{"name":"Alisado"},"de":{"name":"Glättung"}}'),
  ('Corte',                  '{"en":{"name":"Haircut"},"fr":{"name":"Coupe"},"es":{"name":"Corte"},"de":{"name":"Haarschnitt"}}'),
  ('Brushing',               '{"en":{"name":"Blow-dry"},"fr":{"name":"Brushing"},"es":{"name":"Brushing"},"de":{"name":"Föhnen"}}'),
  ('Tratamento tricológico', '{"en":{"name":"Trichology treatment"},"fr":{"name":"Soin trichologique"},"es":{"name":"Tratamiento tricológico"},"de":{"name":"Trichologische Behandlung"}}'),
  ('Manicure',               '{"en":{"name":"Manicure"},"fr":{"name":"Manucure"},"es":{"name":"Manicura"},"de":{"name":"Maniküre"}}'),
  ('Pedicure',               '{"en":{"name":"Pedicure"},"fr":{"name":"Pédicure"},"es":{"name":"Pedicura"},"de":{"name":"Pediküre"}}'),
  ('Unhas de gel',           '{"en":{"name":"Gel nails"},"fr":{"name":"Ongles en gel"},"es":{"name":"Uñas de gel"},"de":{"name":"Gelnägel"}}'),
  ('Design de sobrancelhas', '{"en":{"name":"Brow design"},"fr":{"name":"Restructuration des sourcils"},"es":{"name":"Diseño de cejas"},"de":{"name":"Augenbrauen-Styling"}}'),
  ('Lavagem',                '{"en":{"name":"Wash"},"fr":{"name":"Shampooing"},"es":{"name":"Lavado"},"de":{"name":"Haarwäsche"}}'),
  ('Hidratação',             '{"en":{"name":"Deep conditioning"},"fr":{"name":"Soin hydratant"},"es":{"name":"Hidratación"},"de":{"name":"Feuchtigkeitspflege"}}')
) as t(name, i18n) where s.name = t.name and s.i18n = '{}'::jsonb;

update public.gallery_items g set i18n = t.i18n::jsonb from (values
  ('Madeixas',   '{"en":"Highlights","fr":"Mèches","es":"Mechas","de":"Strähnen"}'),
  ('Alisamento', '{"en":"Straightening","fr":"Lissage","es":"Alisado","de":"Glättung"}'),
  ('Coloração',  '{"en":"Colour","fr":"Coloration","es":"Coloración","de":"Coloration"}')
) as t(title, i18n) where g.title = t.title and g.i18n = '{}'::jsonb;
