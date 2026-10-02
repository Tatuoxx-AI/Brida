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
