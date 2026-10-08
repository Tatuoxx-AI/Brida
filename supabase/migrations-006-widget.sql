-- Chaves do widget de agenda no ecrã inicial (iPhone/Android). Uma chave por telemóvel,
-- criada e revogada no painel. Só se guarda o hash; a chave em claro aparece uma única vez.
create table if not exists public.widget_tokens (
  id           uuid primary key default gen_random_uuid(),
  label        text not null check (char_length(label) between 1 and 60),
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.widget_tokens enable row level security;
revoke all on table public.widget_tokens from anon, authenticated;
