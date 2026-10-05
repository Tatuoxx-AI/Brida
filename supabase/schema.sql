-- =============================================================================
-- Brida Coiffeur — schema Supabase (PostgreSQL 15+)
--
-- Como aplicar: SQL Editor do Supabase → colar e executar, num projeto novo.
-- O ficheiro assume uma base vazia (não faz DROP).
--
-- Decisões que convém conhecer antes de mexer:
--   • profiles.id NÃO é o id do auth.users. A ficha do cliente existe mesmo sem
--     conta (criada pelo salão no CRM, pela IA ou pelo WhatsApp); profiles.user_id
--     liga-a à conta quando a pessoa se regista e confirma o email/telefone.
--   • Sobreposição de horários é impedida pela própria base (exclusion constraint
--     em appointments), não só pela aplicação.
--   • Criar, cancelar e reagendar passa por funções RPC (book_appointment,
--     cancel_appointment, reschedule_appointment) que aplicam as regras do salão.
--     Os clientes não têm permissão de UPDATE direto em appointments.
--   • Marcações feitas pelo cliente (site/IA) nascem 'pending' e só passam a
--     'confirmed' quando o cliente confirma pelo WhatsApp (ou o salão confirma no
--     painel). Não há pagamento online por omissão (deposit_percent = 0).
--     Se um dia o sinal for ativado, a marcação com sinal ganha hold_expires_at e
--     expire_pending_holds() liberta o horário quando o sinal não é pago.
--   • Horas guardadas em timestamptz (UTC); dia/hora "do salão" calculados com
--     salon_settings.timezone.
-- =============================================================================

create extension if not exists btree_gist;   -- exclusion constraint (uuid =, range &&)
create extension if not exists pg_trgm;      -- pesquisa por nome no CRM

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'staff', 'client');

create type public.appointment_status as enum (
  'pending',      -- aguarda confirmação por WhatsApp (ou sinal, se hold_expires_at)
  'confirmed',
  'in_progress',  -- em atendimento
  'completed',
  'cancelled',
  'no_show'
);

create type public.appointment_source as enum ('web', 'ai_chat', 'admin', 'whatsapp');

create type public.service_category as enum (
  'corte', 'coloracao', 'tratamento', 'penteado', 'barbearia', 'unhas', 'sobrancelhas', 'estetica'
);

create type public.waitlist_status as enum ('waiting', 'notified', 'booked', 'expired', 'cancelled');
create type public.waitlist_period as enum ('qualquer', 'manha', 'tarde', 'noite');

create type public.payment_kind as enum ('deposit', 'balance', 'order');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.payment_method as enum ('card', 'cash', 'mbway', 'transfer', 'other');

create type public.order_status as enum ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded');
create type public.order_fulfillment as enum ('pickup_at_appointment', 'pickup', 'shipping');

create type public.discount_type as enum ('fixed', 'percent');
create type public.note_kind as enum ('tecnica', 'geral', 'alergia');

create type public.admin_event_type as enum (
  'appointment_requested',   -- nova marcação por confirmar
  'appointment_confirmed',   -- cliente confirmou (pending → confirmed)
  'appointment_created',     -- marcação já confirmada (criada pelo salão)
  'appointment_cancelled',
  'appointment_rescheduled',
  'waitlist_joined',
  'review_received',
  'order_paid'
);

-- -----------------------------------------------------------------------------
-- Configuração do salão (linha única)
-- -----------------------------------------------------------------------------
create table public.salon_settings (
  id                        smallint primary key default 1 check (id = 1),
  name                      text not null default 'Brida Coiffeur',
  tagline                   text,
  about                     text,          -- "Sobre nós" da landing; também vai para o contexto da IA
  phone                     text,
  whatsapp                  text,          -- E.164, ex.: +351912345678
  email                     text,
  address                   text,
  maps_embed_url            text,
  instagram_url             text,
  google_review_url         text,          -- para onde o cliente é levado após avaliar bem
  timezone                  text not null default 'Europe/Lisbon',
  currency                  char(3) not null default 'EUR',
  slot_interval_minutes     int not null default 15 check (slot_interval_minutes between 5 and 60),
  min_lead_minutes          int not null default 60 check (min_lead_minutes >= 0),
  booking_horizon_days      int not null default 60 check (booking_horizon_days > 0),
  -- marcações confirmadas por WhatsApp, sem pagamento online
  require_whatsapp_confirmation boolean not null default true,
  -- sinal desligado (0). Só ativar com o checkout/webhook da Stripe implementados.
  deposit_percent           numeric(5,2) not null default 0 check (deposit_percent between 0 and 100),
  min_deposit               numeric(10,2) not null default 0 check (min_deposit >= 0),
  -- tempo para pagar o sinal; a Stripe não aceita checkouts que expirem em menos de 30 min
  hold_minutes              int not null default 30 check (hold_minutes between 30 and 120),
  cancellation_window_hours int not null default 24 check (cancellation_window_hours >= 0),
  loyalty_points_per_unit   numeric(6,2) not null default 1 check (loyalty_points_per_unit >= 0),  -- (legado)
  area                      text,          -- "Portimão · Algarve", mostrado no site
  facebook_url              text,
  -- assistente de IA (editável no painel → Assistente)
  assistant_name            text not null default 'Brida Chat',
  assistant_greeting        text not null default 'Olá! Sou o Brida Chat, o assistente do Brida Coiffeur ✨ Posso ajudar com horários, serviços e marcações — a qualquer hora.',
  assistant_instructions    text,          -- regras/FAQ extra que o salão quer que a IA siga
  -- cartão de fidelidade: 1 carimbo por visita concluída
  loyalty_stamps_required   int not null default 10 check (loyalty_stamps_required between 2 and 50),
  loyalty_reward            text not null default 'Uma hidratação grátis',
  -- automações (painel → Automação)
  auto_confirm_whatsapp     boolean not null default false,  -- pede confirmação por WhatsApp assim que alguém marca
  reminder_24h              boolean not null default false,
  birthday_message          boolean not null default false,
  ai_whatsapp_reply         boolean not null default false,  -- a assistente responde no WhatsApp
  telegram_notify           boolean not null default false,
  hero_image_url            text,          -- foto do topo (painel → Editar site → Fotos)
  about_image_url           text,          -- foto da secção "Sobre"
  content                   jsonb not null default '{}',  -- textos do site alterados no painel (pt)
  content_i18n              jsonb not null default '{}',  -- traduções automáticas {en:{…},fr:{…},…}
  updated_at                timestamptz not null default now()
);

insert into public.salon_settings (id) values (1);

-- Horário de funcionamento do salão. weekday segue extract(dow): 0 = domingo.
create table public.business_hours (
  weekday   smallint primary key check (weekday between 0 and 6),
  opens_at  time,
  closes_at time,
  is_closed boolean not null default false,
  check (is_closed or (opens_at is not null and closes_at is not null and opens_at < closes_at))
);

-- PROVISÓRIO: só se sabe que fecha às 19:00. Confirmar dias e abertura no /admin/cms.
insert into public.business_hours (weekday, opens_at, closes_at, is_closed) values
  (0, null,    null,    true),
  (1, '09:00', '19:00', false),
  (2, '09:00', '19:00', false),
  (3, '09:00', '19:00', false),
  (4, '09:00', '19:00', false),
  (5, '09:00', '19:00', false),
  (6, '09:00', '19:00', false);

-- -----------------------------------------------------------------------------
-- Pessoas
-- -----------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid unique references auth.users (id) on delete set null,
  role             public.user_role not null default 'client',
  name             text not null check (length(trim(name)) > 0),
  phone            text,                 -- E.164
  email            text,
  avatar_url       text,
  loyalty_points   int not null default 0 check (loyalty_points >= 0),
  loyalty_code     text not null unique
                     default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),  -- conteúdo do QR Code
  birth_date       date,
  marketing_opt_in boolean not null default false,
  birthday_sent_year int,                -- evita repetir a mensagem de aniversário no mesmo ano
  -- campos usados quando role = staff/admin
  bio              text,
  commission_rate  numeric(5,2) not null default 0 check (commission_rate between 0 and 100),
  calendar_color   text,
  job_title        text,                              -- cargo mostrado na secção "A nossa equipa"
  socials          jsonb not null default '{}',       -- {instagram, facebook, tiktok}
  i18n             jsonb not null default '{}',       -- {en:{job_title}, …}
  team_order       int not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email)) where email is not null;
create unique index profiles_phone_key on public.profiles (phone) where phone is not null;
create index profiles_role_idx on public.profiles (role) where active;
create index profiles_name_trgm_idx on public.profiles using gin (name gin_trgm_ops);

-- Turnos por profissional (permite turnos partidos). Um profissional sem nenhuma
-- linha aqui herda o horário do salão; com linhas, só trabalha nesses turnos.
create table public.staff_working_hours (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.profiles (id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  check (start_time < end_time),
  unique (staff_id, weekday, start_time)
);

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table public.services (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  category         public.service_category not null,
  duration_minutes int not null check (duration_minutes between 5 and 600),
  price            numeric(10,2) not null check (price >= 0),
  is_addon         boolean not null default false,   -- ex.: Lavagem, Hidratação
  deposit_amount   numeric(10,2) check (deposit_amount >= 0),  -- null = usa salon_settings.deposit_percent
  image_url        text,
  sort_order       int not null default 0,
  active           boolean not null default true,
  i18n             jsonb not null default '{}',   -- {en:{name,description},…}
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index services_category_idx on public.services (category, sort_order) where active;

create table public.staff_services (
  staff_id   uuid not null references public.profiles (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (staff_id, service_id)
);

create index staff_services_service_idx on public.staff_services (service_id);

create table public.products (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  description                text,
  price                      numeric(10,2) not null check (price >= 0),
  stock                      int not null default 0 check (stock >= 0),
  image_url                  text,
  brand                      text,
  -- categorias de serviço a que o produto é sugerido no upsell do /agendar
  related_service_categories public.service_category[] not null default '{}',
  active                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- Descontos em horários de baixa procura (configuráveis no CMS).
create table public.off_peak_discounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  weekday          smallint check (weekday between 0 and 6),   -- null = todos os dias
  start_time       time not null,
  end_time         time not null,
  discount_percent numeric(5,2) not null check (discount_percent > 0 and discount_percent <= 100),
  service_id       uuid references public.services (id) on delete cascade,  -- null = todos
  valid_from       date,
  valid_until      date,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  check (start_time < end_time),
  check (valid_until is null or valid_from is null or valid_from <= valid_until)
);

create table public.gallery_items (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  before_url text,
  after_url  text,                      -- sem foto ainda = espaço reservado no site
  i18n       jsonb not null default '{}',  -- título noutras línguas {en:"…",…}
  service_id uuid references public.services (id) on delete set null,
  staff_id   uuid references public.profiles (id) on delete set null,
  sort_order int not null default 0,
  published  boolean not null default true,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Agenda
-- -----------------------------------------------------------------------------
create table public.appointments (
  id                         uuid primary key default gen_random_uuid(),
  -- código curto que o cliente envia no WhatsApp para confirmar (ex.: #A1B2C3D4)
  code                       text not null unique
                               default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  client_id                  uuid references public.profiles (id) on delete set null,
  staff_id                   uuid not null references public.profiles (id) on delete restrict,
  service_id                 uuid not null references public.services (id) on delete restrict,  -- serviço principal
  start_time                 timestamptz not null,
  end_time                   timestamptz not null,
  status                     public.appointment_status not null default 'pending',
  source                     public.appointment_source not null default 'web',
  total_price                numeric(10,2) not null default 0 check (total_price >= 0),     -- já com desconto
  discount_amount            numeric(10,2) not null default 0 check (discount_amount >= 0),
  deposit_amount             numeric(10,2) not null default 0 check (deposit_amount >= 0),
  deposit_paid               boolean not null default false,
  tip_amount                 numeric(10,2) not null default 0 check (tip_amount >= 0),
  guest_name                 text,       -- marcação sem ficha (balcão/telefone)
  guest_phone                text,
  notes                      text,
  hold_expires_at            timestamptz,
  stripe_checkout_session_id text unique,
  confirmation_sent_at       timestamptz,   -- pedido de confirmação enviado por WhatsApp
  confirmed_at               timestamptz,
  reminder_sent_at           timestamptz,
  cancelled_at               timestamptz,
  cancel_reason              text,
  cancelled_by               uuid references public.profiles (id) on delete set null,
  created_by                 uuid references public.profiles (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (end_time > start_time),
  check (client_id is not null or guest_name is not null),
  -- Nenhum profissional pode ter dois atendimentos ativos sobrepostos.
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'in_progress'))
);

create index appointments_staff_start_idx on public.appointments (staff_id, start_time);
create index appointments_client_start_idx on public.appointments (client_id, start_time desc);
create index appointments_start_idx on public.appointments (start_time);
create index appointments_pending_hold_idx on public.appointments (hold_expires_at) where status = 'pending';

-- Serviços do agendamento (principal + add-ons), com preço/duração congelados.
create table public.appointment_services (
  appointment_id   uuid not null references public.appointments (id) on delete cascade,
  service_id       uuid not null references public.services (id) on delete restrict,
  price            numeric(10,2) not null check (price >= 0),
  duration_minutes int not null check (duration_minutes > 0),
  position         smallint not null default 0,
  primary key (appointment_id, service_id)
);

-- Bloqueios de agenda (folga, formação, almoço, feriado). staff_id null = salão inteiro.
create table public.blocked_slots (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid references public.profiles (id) on delete cascade,
  start_time timestamptz not null,
  end_time   timestamptz not null,
  reason     text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index blocked_slots_range_idx on public.blocked_slots using gist (tstzrange(start_time, end_time, '[)'));

create table public.waitlist (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.profiles (id) on delete cascade,
  service_id       uuid not null references public.services (id) on delete cascade,
  staff_id         uuid references public.profiles (id) on delete set null,  -- null = qualquer
  preferred_date   date not null,
  preferred_period public.waitlist_period not null default 'qualquer',
  status           public.waitlist_status not null default 'waiting',
  notified_at      timestamptz,
  notes            text,
  created_at       timestamptz not null default now()
);

create unique index waitlist_one_active_idx
  on public.waitlist (client_id, service_id, preferred_date) where status = 'waiting';
create index waitlist_date_idx on public.waitlist (preferred_date, status);

create table public.reviews (
  id               uuid primary key default gen_random_uuid(),
  appointment_id   uuid not null unique references public.appointments (id) on delete cascade,
  client_id        uuid references public.profiles (id) on delete set null,
  staff_id         uuid references public.profiles (id) on delete set null,
  rating           smallint not null check (rating between 1 and 5),
  feedback         text,
  shared_to_google boolean not null default false,
  published        boolean not null default false,   -- aparece nos depoimentos da landing
  created_at       timestamptz not null default now()
);

-- Notas técnicas do CRM (fórmulas de coloração, alergias…). Só staff vê.
create table public.client_notes (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.profiles (id) on delete cascade,
  author_id      uuid references public.profiles (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  kind           public.note_kind not null default 'geral',
  content        text not null,
  -- ex.: {"marca":"Wella Koleston","tom":"7/1","oxidante":"20 vol","proporcao":"1:1","pausa_min":35}
  formula        jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index client_notes_client_idx on public.client_notes (client_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Vendas e pagamentos
-- -----------------------------------------------------------------------------
create table public.orders (
  id                         uuid primary key default gen_random_uuid(),
  client_id                  uuid references public.profiles (id) on delete set null,
  appointment_id             uuid references public.appointments (id) on delete set null,
  status                     public.order_status not null default 'pending',
  fulfillment                public.order_fulfillment not null default 'pickup_at_appointment',
  total                      numeric(10,2) not null default 0 check (total >= 0),
  stripe_checkout_session_id text unique,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index orders_client_idx on public.orders (client_id, created_at desc);

create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity   int not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  unique (order_id, product_id)
);

create table public.payments (
  id                         uuid primary key default gen_random_uuid(),
  appointment_id             uuid references public.appointments (id) on delete set null,
  order_id                   uuid references public.orders (id) on delete set null,
  client_id                  uuid references public.profiles (id) on delete set null,
  kind                       public.payment_kind not null,
  status                     public.payment_status not null default 'pending',
  method                     public.payment_method not null default 'card',
  amount                     numeric(10,2) not null check (amount > 0),
  currency                   char(3) not null default 'EUR',
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text unique,
  created_at                 timestamptz not null default now(),
  check (appointment_id is not null or order_id is not null)
);

create index payments_created_idx on public.payments (created_at);
create index payments_appointment_idx on public.payments (appointment_id);

-- Idempotência do webhook da Stripe: o handler insere o event.id antes de agir.
create table public.stripe_events (
  id           text primary key,
  type         text not null,
  processed_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Fidelidade
-- -----------------------------------------------------------------------------
create table public.loyalty_rewards (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  points_required int not null check (points_required > 0),
  discount_type   public.discount_type not null default 'fixed',
  discount_value  numeric(10,2) not null check (discount_value > 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  check (discount_type = 'fixed' or discount_value <= 100)
);

-- Livro-razão de pontos. profiles.loyalty_points é o saldo, mantido por trigger.
create table public.loyalty_transactions (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.profiles (id) on delete cascade,
  points         int not null check (points <> 0),   -- > 0 ganho, < 0 resgate/ajuste
  reason         text not null,
  appointment_id uuid references public.appointments (id) on delete set null,
  reward_id      uuid references public.loyalty_rewards (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index loyalty_tx_client_idx on public.loyalty_transactions (client_id, created_at desc);
-- Um atendimento só gera pontos uma vez.
create unique index loyalty_tx_earn_once_idx
  on public.loyalty_transactions (appointment_id) where points > 0 and reward_id is null;

-- Pedidos de troca do cartão de carimbos (cliente pede, gerente aprova).
create table public.loyalty_redemptions (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles (id) on delete cascade,
  stamps      int not null check (stamps > 0),
  reward      text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

create index loyalty_redemptions_pending_idx on public.loyalty_redemptions (created_at) where status = 'pending';

-- Notas livres do gerente (painel → Notas).
create table public.manager_notes (
  id         uuid primary key default gen_random_uuid(),
  content    text not null check (length(trim(content)) > 0),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Credenciais das integrações (WhatsApp Business da Meta, Telegram). Linha única.
-- RLS ligado e SEM políticas: só o servidor (service role / ligação direta) lê.
create table public.integration_secrets (
  id                        smallint primary key default 1 check (id = 1),
  whatsapp_phone_number_id  text,
  whatsapp_access_token     text,
  whatsapp_app_secret       text,   -- valida a assinatura dos webhooks da Meta
  whatsapp_verify_token     text,   -- token do "Verify" ao registar o webhook na Meta
  telegram_bot_token        text,
  telegram_chat_id          text,
  updated_at                timestamptz not null default now()
);

insert into public.integration_secrets (id) values (1);

-- Fotos do site carregadas pelo painel, servidas em /media/<id>.
create table public.media (
  id         uuid primary key default gen_random_uuid(),
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data       bytea not null,
  bytes      int not null check (bytes > 0 and bytes <= 4194304),
  width      int,
  height     int,
  created_at timestamptz not null default now()
);

-- Aparelhos do gerente que recebem notificações push (Web Push). Só o servidor lê.
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

-- -----------------------------------------------------------------------------
-- Feed do painel (consumido pela <NotificationBar /> via Realtime)
-- -----------------------------------------------------------------------------
create table public.admin_events (
  id             bigint generated always as identity primary key,
  type           public.admin_event_type not null,
  title          text not null,
  body           text,
  appointment_id uuid references public.appointments (id) on delete cascade,
  waitlist_id    uuid references public.waitlist (id) on delete cascade,
  payload        jsonb not null default '{}',
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index admin_events_created_idx on public.admin_events (created_at desc);

-- =============================================================================
-- Funções auxiliares de autorização
-- (security definer para poderem ler profiles sem cair em recursão de RLS)
-- =============================================================================
create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.profiles where user_id = auth.uid() limit 1
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
     where user_id = auth.uid() and role in ('admin', 'staff') and active
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
     where user_id = auth.uid() and role = 'admin' and active
  )
$$;

-- =============================================================================
-- Triggers genéricos
-- =============================================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger set_updated_at before update on public.salon_settings for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.profiles       for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.services       for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.products       for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.appointments   for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.client_notes   for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.orders         for each row execute function public.tg_set_updated_at();

-- Quem não é admin não pode promover-se, mexer no saldo de pontos, na comissão
-- nem na ligação à conta. O saldo só muda pelo trigger de loyalty_transactions.
create or replace function public.tg_protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;   -- service role / SQL editor / admin
  end if;
  if new.role is distinct from old.role
     or new.user_id is distinct from old.user_id
     or new.loyalty_code is distinct from old.loyalty_code
     or new.commission_rate is distinct from old.commission_rate then
    raise exception 'PERMISSION_DENIED' using hint = 'Apenas o admin altera este campo.';
  end if;
  if new.loyalty_points is distinct from old.loyalty_points and pg_trigger_depth() < 2 then
    raise exception 'PERMISSION_DENIED' using hint = 'Pontos só mudam via loyalty_transactions.';
  end if;
  return new;
end $$;

create trigger protect_columns before update on public.profiles
  for each row execute function public.tg_protect_profile_columns();

-- =============================================================================
-- Ligação conta ↔ ficha de cliente
-- Só liga a uma ficha existente pelo canal CONFIRMADO (email ou telefone), para
-- ninguém se apropriar do histórico de outra pessoa registando-se com o email dela.
-- =============================================================================
create or replace function public.link_or_create_profile(p_user auth.users)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_profile uuid;
  v_name    text;
  v_phone   text;
begin
  if exists (select 1 from public.profiles where user_id = p_user.id) then
    return;
  end if;

  v_phone := coalesce(p_user.phone, p_user.raw_user_meta_data ->> 'phone');
  if v_phone is not null and v_phone <> '' and left(v_phone, 1) <> '+' then
    v_phone := '+' || v_phone;   -- auth.users guarda o telefone sem '+'
  end if;
  v_name := coalesce(
    nullif(p_user.raw_user_meta_data ->> 'name', ''),
    nullif(p_user.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(coalesce(p_user.email, ''), '@', 1), ''),
    'Cliente'
  );

  select id into v_profile
    from public.profiles
   where user_id is null
     and (
       (p_user.email_confirmed_at is not null and p_user.email is not null and lower(email) = lower(p_user.email))
       or (p_user.phone_confirmed_at is not null and v_phone is not null and phone = v_phone)
     )
   order by created_at
   limit 1;

  if v_profile is not null then
    update public.profiles
       set user_id    = p_user.id,
           email      = coalesce(email, p_user.email),
           avatar_url = coalesce(avatar_url, p_user.raw_user_meta_data ->> 'avatar_url')
     where id = v_profile;
  else
    insert into public.profiles (user_id, name, email, phone, avatar_url)
    values (
      p_user.id, v_name,
      -- email/telefone já usados por outra ficha não são copiados (índices únicos);
      -- o salão junta as fichas no CRM se for a mesma pessoa
      case when exists (select 1 from public.profiles where lower(email) = lower(p_user.email)) then null else p_user.email end,
      case when exists (select 1 from public.profiles where phone = v_phone) then null else nullif(v_phone, '') end,
      p_user.raw_user_meta_data ->> 'avatar_url'
    );
  end if;
end $$;

create or replace function public.tg_on_auth_user_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null or new.phone_confirmed_at is not null then
    perform public.link_or_create_profile(new);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_on_auth_user_change();

create trigger on_auth_user_confirmed
  after update of email_confirmed_at, phone_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is distinct from new.email_confirmed_at
        or old.phone_confirmed_at is distinct from new.phone_confirmed_at)
  execute function public.tg_on_auth_user_change();

-- =============================================================================
-- Disponibilidade e regras de marcação
-- =============================================================================

-- Maior desconto de baixa procura aplicável a um início de atendimento.
create or replace function public.off_peak_discount(p_start timestamptz, p_service_ids uuid[])
returns numeric language sql stable security definer set search_path = '' as $$
  with local as (
    select (p_start at time zone s.timezone) as ts from public.salon_settings s where s.id = 1
  )
  select coalesce(max(d.discount_percent), 0)
    from public.off_peak_discounts d, local
   where d.active
     and (d.weekday is null or d.weekday = extract(dow from local.ts))
     and local.ts::time >= d.start_time and local.ts::time < d.end_time
     and (d.service_id is null or d.service_id = any (p_service_ids))
     and (d.valid_from is null or local.ts::date >= d.valid_from)
     and (d.valid_until is null or local.ts::date <= d.valid_until)
$$;

-- Liberta horários de pré-agendamentos cujo sinal não foi pago a tempo.
-- Chamada no início de book/reschedule; também pode correr no pg_cron (ver fim).
create or replace function public.expire_pending_holds()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Sinal não pago dentro do prazo'
   where status = 'pending' and hold_expires_at is not null and hold_expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Horários livres de um dia para um conjunto de serviços.
-- Usado pelo /agendar e pela IA (function calling). Devolve só horários livres,
-- por isso pode ser chamada pelo anon sem expor a agenda.
create or replace function public.get_available_slots(
  p_date               date,
  p_service_ids        uuid[],
  p_staff_id           uuid default null,
  p_ignore_appointment uuid default null   -- usado no reagendamento
)
returns table (
  staff_id         uuid,
  staff_name       text,
  slot_start       timestamptz,
  slot_end         timestamptz,
  discount_percent numeric
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  s          public.salon_settings;
  v_duration int;
  v_found    int;
  v_wanted   int;
  v_today    date;
  v_dow      smallint := extract(dow from p_date);
begin
  select * into s from public.salon_settings where id = 1;
  v_today := (now() at time zone s.timezone)::date;

  select count(distinct x) into v_wanted from unnest(p_service_ids) as x;
  select count(*), sum(sv.duration_minutes)
    into v_found, v_duration
    from public.services sv
   where sv.id = any (p_service_ids) and sv.active;

  if v_wanted = 0 or v_found <> v_wanted then
    raise exception 'INVALID_SERVICES' using hint = 'Serviço inexistente ou inativo.';
  end if;

  if p_date < v_today or p_date > v_today + s.booking_horizon_days then
    return;
  end if;

  return query
  with staff as (
    select p.id, p.name
      from public.profiles p
     where p.role in ('staff', 'admin') and p.active
       and (p_staff_id is null or p.id = p_staff_id)
       -- tem de fazer TODOS os serviços pedidos
       and not exists (
         select 1 from unnest(p_service_ids) as req(sid)
          where not exists (
            select 1 from public.staff_services ss
             where ss.staff_id = p.id and ss.service_id = req.sid
          )
       )
  ),
  shifts_raw as (
    select st.id as sid, st.name as sname, w.start_time as t0, w.end_time as t1
      from staff st
      join public.staff_working_hours w on w.staff_id = st.id and w.weekday = v_dow
    union all
    select st.id, st.name, b.opens_at, b.closes_at
      from staff st
      join public.business_hours b on b.weekday = v_dow and not b.is_closed
     where not exists (select 1 from public.staff_working_hours w where w.staff_id = st.id)
  ),
  shifts as (
    -- recorta pelo horário do salão (dia fechado = sem turnos)
    select r.sid, r.sname, greatest(r.t0, b.opens_at) as t0, least(r.t1, b.closes_at) as t1
      from shifts_raw r
      join public.business_hours b on b.weekday = v_dow and not b.is_closed
  ),
  candidates as (
    select sh.sid, sh.sname,
           (ts at time zone s.timezone) as c_start,
           (ts at time zone s.timezone) + make_interval(mins => v_duration) as c_end
      from shifts sh,
           generate_series(
             p_date + sh.t0,
             p_date + sh.t1 - make_interval(mins => v_duration),
             make_interval(mins => s.slot_interval_minutes)
           ) as ts
     where sh.t0 < sh.t1
  )
  select c.sid, c.sname, c.c_start, c.c_end,
         public.off_peak_discount(c.c_start, p_service_ids)
    from candidates c
   where c.c_start >= now() + make_interval(mins => s.min_lead_minutes)
     and not exists (
       select 1 from public.appointments a
        where a.staff_id = c.sid
          and a.id is distinct from p_ignore_appointment
          and a.status in ('pending', 'confirmed', 'in_progress')
          and (a.status <> 'pending' or a.hold_expires_at is null or a.hold_expires_at > now())
          and tstzrange(a.start_time, a.end_time, '[)') && tstzrange(c.c_start, c.c_end, '[)')
     )
     and not exists (
       select 1 from public.blocked_slots b
        where (b.staff_id is null or b.staff_id = c.sid)
          and tstzrange(b.start_time, b.end_time, '[)') && tstzrange(c.c_start, c.c_end, '[)')
     )
   order by c.c_start, c.sname;
end $$;

-- Resumo de vagas por dia (para os carimbos da agenda online). Máx. ~2 meses por pedido.
create or replace function public.get_month_availability(p_from date, p_to date, p_service_ids uuid[])
returns table (day date, free_slots int, is_closed boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  d date;
begin
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'INVALID_RANGE';
  end if;
  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    day := d;
    is_closed := coalesce(
      (select b.is_closed from public.business_hours b where b.weekday = extract(dow from d)),
      true
    );
    select count(distinct g.slot_start)::int into free_slots
      from public.get_available_slots(d, p_service_ids) g;
    return next;
  end loop;
end $$;

-- Cria um agendamento validando horário, profissional, preço, desconto e sinal.
--   • Cliente autenticado: marca sempre para si (p_client_id é ignorado).
--   • Staff: marca para qualquer cliente; com p_staff_id definido pode furar a
--     grelha de horários e os bloqueios (a sobreposição continua proibida).
--   • Service role (rotas da IA/WhatsApp no servidor): passa p_client_id ou guest.
-- Erros devolvidos na mensagem: INVALID_SERVICES, CLIENT_REQUIRED, SLOT_UNAVAILABLE.
create or replace function public.book_appointment(
  p_service_ids uuid[],
  p_start       timestamptz,
  p_staff_id    uuid default null,
  p_client_id   uuid default null,
  p_guest_name  text default null,
  p_guest_phone text default null,
  p_source      public.appointment_source default 'web',
  p_notes       text default null
)
returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare
  s          public.salon_settings;
  v_staff_me boolean := public.is_staff();
  -- staff autenticado, ou o servidor (sem auth.uid) a marcar pelo painel do gerente
  v_trusted  boolean := public.is_staff() or (auth.uid() is null and p_source = 'admin');
  v_me       uuid    := public.current_profile_id();
  v_client   uuid;
  v_staff    uuid;
  v_main     uuid;
  v_duration int;
  v_price    numeric;
  v_deposit  numeric;
  v_dep_fixed numeric;
  v_dep_base numeric;
  v_disc     numeric;
  v_total    numeric;
  v_found    int;
  v_wanted   int;
  v_status   public.appointment_status;
  r          public.appointments;
begin
  select * into s from public.salon_settings where id = 1;
  perform public.expire_pending_holds();

  if auth.uid() is null or v_staff_me then
    v_client := p_client_id;
  else
    v_client := v_me;
    if v_client is null then
      raise exception 'CLIENT_REQUIRED' using hint = 'Conta sem ficha de cliente.';
    end if;
  end if;
  if v_client is null and nullif(trim(p_guest_name), '') is null then
    raise exception 'CLIENT_REQUIRED';
  end if;

  select count(distinct x) into v_wanted from unnest(p_service_ids) as x;
  select count(*), sum(duration_minutes), sum(price),
         coalesce(sum(deposit_amount), 0),
         coalesce(sum(price) filter (where deposit_amount is null), 0)
    into v_found, v_duration, v_price, v_dep_fixed, v_dep_base
    from public.services
   where id = any (p_service_ids) and active;
  if v_wanted = 0 or v_found <> v_wanted then
    raise exception 'INVALID_SERVICES';
  end if;

  -- principal = primeiro serviço que não é add-on, pela ordem escolhida
  select id into v_main
    from public.services
   where id = any (p_service_ids)
   order by is_addon, array_position(p_service_ids, id)
   limit 1;

  if v_trusted and p_staff_id is not null then
    v_staff := p_staff_id;
  else
    -- "qualquer um disponível": quem tem menos atendimentos nesse dia
    select g.staff_id into v_staff
      from public.get_available_slots((p_start at time zone s.timezone)::date, p_service_ids, p_staff_id) g
     where g.slot_start = p_start
     order by (
       select count(*) from public.appointments a
        where a.staff_id = g.staff_id
          and a.status in ('pending', 'confirmed', 'in_progress')
          and (a.start_time at time zone s.timezone)::date = (p_start at time zone s.timezone)::date
     ), random()
     limit 1;
    if v_staff is null then
      raise exception 'SLOT_UNAVAILABLE';
    end if;
  end if;

  v_disc  := public.off_peak_discount(p_start, p_service_ids);
  v_total := round(v_price * (1 - v_disc / 100), 2);
  -- sinal = valores fixos por serviço + % sobre o preço já com desconto
  v_deposit := round(v_dep_fixed + v_dep_base * (1 - v_disc / 100) * s.deposit_percent / 100, 2);
  if v_deposit > 0 then
    v_deposit := least(v_total, greatest(v_deposit, s.min_deposit));
  end if;

  -- salão a marcar no painel → confirmada; com sinal → pending com prazo;
  -- sem sinal → pending até confirmar por WhatsApp (sem prazo automático)
  v_status := case
    when v_trusted and p_source = 'admin' then 'confirmed'
    when v_deposit > 0 then 'pending'
    when s.require_whatsapp_confirmation then 'pending'
    else 'confirmed'
  end;

  begin
    insert into public.appointments (
      client_id, staff_id, service_id, start_time, end_time, status, source,
      total_price, discount_amount, deposit_amount, guest_name, guest_phone,
      notes, hold_expires_at, created_by
    ) values (
      v_client, v_staff, v_main, p_start, p_start + make_interval(mins => v_duration),
      v_status, p_source, v_total, round(v_price - v_total, 2), v_deposit,
      nullif(trim(p_guest_name), ''), nullif(trim(p_guest_phone), ''), p_notes,
      case when v_status = 'pending' and v_deposit > 0 then now() + make_interval(mins => s.hold_minutes) end,
      v_me
    )
    returning * into r;
  exception when exclusion_violation then
    raise exception 'SLOT_UNAVAILABLE';
  end;

  insert into public.appointment_services (appointment_id, service_id, price, duration_minutes, position)
  select r.id, sv.id, sv.price, sv.duration_minutes, array_position(p_service_ids, sv.id) - 1
    from public.services sv
   where sv.id = any (p_service_ids);

  return r;
end $$;

-- Cancelamento. Cliente: só os seus e fora da janela de cancelamento.
-- O reembolso do sinal é decidido pela aplicação (Stripe) a partir do retorno.
-- Erros: NOT_FOUND, PERMISSION_DENIED, INVALID_STATUS, CANCELLATION_WINDOW.
create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare
  s        public.salon_settings;
  r        public.appointments;
  v_staff  boolean := public.is_staff();
  v_me     uuid    := public.current_profile_id();
begin
  select * into s from public.salon_settings where id = 1;
  select * into r from public.appointments where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if auth.uid() is not null and not v_staff then
    if r.client_id is distinct from v_me then
      raise exception 'PERMISSION_DENIED';
    end if;
    if r.status = 'confirmed' and r.start_time - now() < make_interval(hours => s.cancellation_window_hours) then
      raise exception 'CANCELLATION_WINDOW'
        using hint = format('Cancelamentos online até %s h antes. Contacte o salão.', s.cancellation_window_hours);
    end if;
  end if;

  if r.status not in ('pending', 'confirmed') and not (v_staff and r.status = 'in_progress') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason, cancelled_by = v_me
   where id = p_id
  returning * into r;
  return r;
end $$;

-- Reagendamento mantendo serviços e sinal. Recalcula o desconto de baixa procura.
-- Erros: NOT_FOUND, PERMISSION_DENIED, INVALID_STATUS, CANCELLATION_WINDOW, SLOT_UNAVAILABLE.
create or replace function public.reschedule_appointment(
  p_id       uuid,
  p_start    timestamptz,
  p_staff_id uuid default null   -- null = mantém o profissional atual
)
returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare
  s          public.salon_settings;
  r          public.appointments;
  v_staff_me boolean := public.is_staff();
  v_me       uuid    := public.current_profile_id();
  v_services uuid[];
  v_duration int;
  v_price    numeric;
  v_disc     numeric;
  v_total    numeric;
  v_staff    uuid;
begin
  select * into s from public.salon_settings where id = 1;
  perform public.expire_pending_holds();

  select * into r from public.appointments where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if r.status not in ('pending', 'confirmed') then
    raise exception 'INVALID_STATUS';
  end if;
  if auth.uid() is not null and not v_staff_me then
    if r.client_id is distinct from v_me then
      raise exception 'PERMISSION_DENIED';
    end if;
    if r.start_time - now() < make_interval(hours => s.cancellation_window_hours) then
      raise exception 'CANCELLATION_WINDOW';
    end if;
  end if;

  select array_agg(service_id order by position), sum(duration_minutes), sum(price)
    into v_services, v_duration, v_price
    from public.appointment_services
   where appointment_id = r.id;

  v_staff := coalesce(p_staff_id, r.staff_id);

  if not (v_staff_me and p_staff_id is not null) then
    perform 1
      from public.get_available_slots((p_start at time zone s.timezone)::date, v_services, v_staff, r.id) g
     where g.slot_start = p_start;
    if not found then
      raise exception 'SLOT_UNAVAILABLE';
    end if;
  end if;

  v_disc  := public.off_peak_discount(p_start, v_services);
  v_total := round(v_price * (1 - v_disc / 100), 2);

  begin
    update public.appointments
       set start_time      = p_start,
           end_time        = p_start + make_interval(mins => v_duration),
           staff_id        = v_staff,
           total_price     = v_total,
           discount_amount = round(v_price - v_total, 2),
           reminder_sent_at = null
     where id = r.id
    returning * into r;
  exception when exclusion_violation then
    raise exception 'SLOT_UNAVAILABLE';
  end;
  return r;
end $$;

-- =============================================================================
-- Triggers de negócio
-- =============================================================================

create or replace function public.tg_appointment_confirmed_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    new.confirmed_at := coalesce(new.confirmed_at, now());
    new.hold_expires_at := null;
  end if;
  return new;
end $$;

create trigger appointment_confirmed_at before insert or update of status on public.appointments
  for each row execute function public.tg_appointment_confirmed_at();

-- Saldo de pontos = soma do livro-razão.
create or replace function public.tg_apply_loyalty_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set loyalty_points = loyalty_points + new.points where id = new.client_id;
  return new;
end $$;

create trigger apply_loyalty after insert on public.loyalty_transactions
  for each row execute function public.tg_apply_loyalty_transaction();

-- Atendimento concluído → pontos para o cliente.
create or replace function public.tg_award_loyalty_points()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_points int;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.client_id is not null then
    v_points := 1;   -- cartão de carimbos: uma visita = um carimbo
    if v_points > 0 then
      insert into public.loyalty_transactions (client_id, points, reason, appointment_id)
      values (new.client_id, v_points, 'Visita concluída', new.id)
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger award_loyalty after update of status on public.appointments
  for each row execute function public.tg_award_loyalty_points();

-- Eventos para o painel: novo agendamento (só quando confirma, para não
-- notificar pré-agendamentos que expiram), cancelamento e reagendamento.
create or replace function public.tg_appointment_admin_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_tz      text;
  v_client  text;
  v_service text;
  v_when    text;
  v_type    public.admin_event_type;
  v_title   text;
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    v_type := 'appointment_created';   v_title := 'Novo agendamento';
  elsif tg_op = 'INSERT' and new.status = 'pending' and new.hold_expires_at is null then
    v_type := 'appointment_requested'; v_title := 'Nova marcação por confirmar';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'confirmed' then
    v_type := 'appointment_confirmed'; v_title := 'Marcação confirmada';
  elsif tg_op = 'UPDATE' and new.status = 'cancelled'
        and (old.status in ('confirmed', 'in_progress') or (old.status = 'pending' and old.hold_expires_at is null)) then
    v_type := 'appointment_cancelled'; v_title := 'Agendamento cancelado';
  elsif tg_op = 'UPDATE' and new.status = 'confirmed' and old.status = 'confirmed'
        and (new.start_time <> old.start_time or new.staff_id <> old.staff_id) then
    v_type := 'appointment_rescheduled'; v_title := 'Agendamento reagendado';
  else
    return new;
  end if;

  select timezone into v_tz from public.salon_settings where id = 1;
  select coalesce((select name from public.profiles where id = new.client_id), new.guest_name, 'Cliente') into v_client;
  select name into v_service from public.services where id = new.service_id;
  v_when := to_char(new.start_time at time zone v_tz, 'DD/MM HH24:MI');

  insert into public.admin_events (type, title, body, appointment_id, payload)
  values (
    v_type, v_title,
    format('%s · %s · %s', v_client, v_service, v_when),
    new.id,
    jsonb_build_object('staff_id', new.staff_id, 'start_time', new.start_time, 'client', v_client, 'service', v_service)
  );
  return new;
end $$;

create trigger appointment_admin_events after insert or update on public.appointments
  for each row execute function public.tg_appointment_admin_events();

create or replace function public.tg_waitlist_admin_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_events (type, title, body, waitlist_id, payload)
  select 'waitlist_joined', 'Entrada na fila de espera',
         format('%s · %s · %s', p.name, sv.name, to_char(new.preferred_date, 'DD/MM')),
         new.id,
         jsonb_build_object('client', p.name, 'service', sv.name, 'preferred_date', new.preferred_date)
    from public.profiles p, public.services sv
   where p.id = new.client_id and sv.id = new.service_id;
  return new;
end $$;

create trigger waitlist_admin_event after insert on public.waitlist
  for each row execute function public.tg_waitlist_admin_event();

create or replace function public.tg_review_admin_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_events (type, title, body, appointment_id, payload)
  values ('review_received', 'Nova avaliação', format('%s estrela(s)', new.rating), new.appointment_id,
          jsonb_build_object('rating', new.rating, 'review_id', new.id));
  return new;
end $$;

create trigger review_admin_event after insert on public.reviews
  for each row execute function public.tg_review_admin_event();

-- Encomenda paga → baixa de stock + evento.
create or replace function public.tg_order_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
    update public.products p
       set stock = greatest(0, p.stock - oi.quantity)
      from public.order_items oi
     where oi.order_id = new.id and oi.product_id = p.id;
    insert into public.admin_events (type, title, body, payload)
    values ('order_paid', 'Venda de produtos', format('Encomenda de %s', to_char(new.total, 'FM999990.00')),
            jsonb_build_object('order_id', new.id, 'total', new.total));
  end if;
  return new;
end $$;

create trigger order_paid before update of status on public.orders
  for each row execute function public.tg_order_paid();

-- Uma avaliação só para um atendimento concluído do próprio cliente.
create or replace function public.tg_review_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = new.appointment_id;
  if a.status <> 'completed' then
    raise exception 'INVALID_STATUS' using hint = 'Só é possível avaliar atendimentos concluídos.';
  end if;
  new.client_id := a.client_id;
  new.staff_id  := a.staff_id;
  return new;
end $$;

create trigger review_fill before insert on public.reviews
  for each row execute function public.tg_review_fill();

-- =============================================================================
-- Views
-- =============================================================================

-- Profissionais visíveis no site (sem telefone/email/comissão). Corre com os
-- privilégios do dono para o anon poder ler sem acesso à tabela profiles.
create view public.public_staff as
select p.id, p.name, p.avatar_url, p.bio, p.calendar_color,
       coalesce(array_agg(ss.service_id) filter (where ss.service_id is not null), '{}') as service_ids,
       p.job_title, p.socials, p.i18n, p.team_order
  from public.profiles p
  left join public.staff_services ss on ss.staff_id = p.id
 where p.role in ('staff', 'admin') and p.active
 group by p.id;

-- Financeiro (respeitam RLS: só staff vê dados).
create view public.v_daily_revenue with (security_invoker = true) as
with tz as (select timezone from public.salon_settings where id = 1),
services_day as (
  select (a.start_time at time zone tz.timezone)::date as day,
         sum(a.total_price) as services_revenue,
         sum(a.tip_amount)  as tips,
         count(*)           as appointments
    from public.appointments a, tz
   where a.status = 'completed'
   group by 1
),
products_day as (
  select (o.paid_at at time zone tz.timezone)::date as day, sum(o.total) as products_revenue
    from public.orders o, tz
   where o.status in ('paid', 'fulfilled') and o.paid_at is not null
   group by 1
)
select coalesce(s.day, p.day)                    as day,
       coalesce(s.services_revenue, 0)           as services_revenue,
       coalesce(p.products_revenue, 0)           as products_revenue,
       coalesce(s.tips, 0)                       as tips,
       coalesce(s.appointments, 0)               as appointments,
       coalesce(s.services_revenue, 0) + coalesce(p.products_revenue, 0) as total_revenue
  from services_day s
  full join products_day p on p.day = s.day;

create view public.v_staff_commissions with (security_invoker = true) as
with tz as (select timezone from public.salon_settings where id = 1)
select p.id                                                         as staff_id,
       p.name                                                       as staff_name,
       date_trunc('month', a.start_time at time zone tz.timezone)::date as month,
       count(*)                                                     as appointments,
       sum(a.total_price)                                           as revenue,
       sum(a.tip_amount)                                            as tips,
       p.commission_rate,
       round(sum(a.total_price) * p.commission_rate / 100, 2)       as commission
  from public.appointments a
  join public.profiles p on p.id = a.staff_id
  cross join tz
 where a.status = 'completed'
 group by p.id, p.name, p.commission_rate, 3;

-- =============================================================================
-- Row Level Security
-- Regra geral: anon lê o catálogo público; cliente vê o que é seu; staff vê e
-- gere a operação; admin gere configuração, preços e equipa. A service role
-- (usada só no servidor: webhooks, IA) ignora RLS.
-- =============================================================================
alter table public.salon_settings       enable row level security;
alter table public.business_hours       enable row level security;
alter table public.profiles             enable row level security;
alter table public.staff_working_hours  enable row level security;
alter table public.services             enable row level security;
alter table public.staff_services       enable row level security;
alter table public.products             enable row level security;
alter table public.off_peak_discounts   enable row level security;
alter table public.gallery_items        enable row level security;
alter table public.appointments         enable row level security;
alter table public.appointment_services enable row level security;
alter table public.blocked_slots        enable row level security;
alter table public.waitlist             enable row level security;
alter table public.reviews              enable row level security;
alter table public.client_notes         enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.payments             enable row level security;
alter table public.stripe_events        enable row level security;  -- sem políticas: só service role
alter table public.loyalty_rewards      enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.admin_events         enable row level security;
alter table public.loyalty_redemptions  enable row level security;
alter table public.manager_notes        enable row level security;  -- só servidor
alter table public.integration_secrets  enable row level security;  -- só servidor
alter table public.push_subscriptions   enable row level security;  -- só servidor
alter table public.media                enable row level security;  -- só servidor

-- Catálogo público --------------------------------------------------------------
create policy "settings: leitura pública" on public.salon_settings for select using (true);
create policy "settings: admin altera"    on public.salon_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "horário: leitura pública" on public.business_hours for select using (true);
create policy "horário: admin gere"      on public.business_hours for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "serviços: ativos públicos" on public.services for select using (active or public.is_staff());
create policy "serviços: admin gere"      on public.services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "staff_services: leitura pública" on public.staff_services for select using (true);
create policy "staff_services: admin gere"      on public.staff_services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "produtos: ativos públicos" on public.products for select using (active or public.is_staff());
create policy "produtos: admin gere"      on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "descontos: ativos públicos" on public.off_peak_discounts for select using (active or public.is_staff());
create policy "descontos: admin gere"      on public.off_peak_discounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "galeria: publicada pública" on public.gallery_items for select using (published or public.is_staff());
create policy "galeria: staff gere"        on public.gallery_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "recompensas: ativas públicas" on public.loyalty_rewards for select using (active or public.is_staff());
create policy "recompensas: admin gere"      on public.loyalty_rewards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "avaliações: publicadas públicas" on public.reviews for select
  using (published or public.is_staff() or client_id = public.current_profile_id());
create policy "avaliações: cliente avalia o seu atendimento" on public.reviews for insert to authenticated
  with check (exists (
    select 1 from public.appointments a
     where a.id = appointment_id and a.client_id = public.current_profile_id()
  ));
create policy "avaliações: staff modera" on public.reviews for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "avaliações: admin apaga" on public.reviews for delete to authenticated
  using (public.is_admin());

-- Perfis ------------------------------------------------------------------------
create policy "perfis: o próprio ou staff" on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "perfis: o próprio atualiza" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "perfis: staff atualiza clientes" on public.profiles for update to authenticated
  using (public.is_staff() and role = 'client') with check (public.is_staff() and role = 'client');
create policy "perfis: staff cria clientes" on public.profiles for insert to authenticated
  with check (public.is_staff() and (role = 'client' or public.is_admin()));
create policy "perfis: admin gere" on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "turnos: staff lê" on public.staff_working_hours for select to authenticated using (public.is_staff());
create policy "turnos: admin gere" on public.staff_working_hours for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Agenda ------------------------------------------------------------------------
-- Escrita de clientes só via RPC (book/cancel/reschedule_appointment).
create policy "agendamentos: cliente vê os seus" on public.appointments for select to authenticated
  using (client_id = public.current_profile_id() or public.is_staff());
create policy "agendamentos: staff cria"   on public.appointments for insert to authenticated with check (public.is_staff());
create policy "agendamentos: staff altera" on public.appointments for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "agendamentos: admin apaga"  on public.appointments for delete to authenticated using (public.is_admin());

create policy "itens do agendamento: segue o agendamento" on public.appointment_services for select to authenticated
  using (exists (
    select 1 from public.appointments a
     where a.id = appointment_id and (a.client_id = public.current_profile_id() or public.is_staff())
  ));
create policy "itens do agendamento: staff gere" on public.appointment_services for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "bloqueios: staff gere" on public.blocked_slots for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "fila: cliente vê as suas" on public.waitlist for select to authenticated
  using (client_id = public.current_profile_id() or public.is_staff());
create policy "fila: cliente entra" on public.waitlist for insert to authenticated
  with check ((client_id = public.current_profile_id() and status = 'waiting') or public.is_staff());
create policy "fila: cliente desiste" on public.waitlist for update to authenticated
  using (client_id = public.current_profile_id()) with check (client_id = public.current_profile_id() and status = 'cancelled');
create policy "fila: staff gere" on public.waitlist for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "notas: só staff" on public.client_notes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Vendas ------------------------------------------------------------------------
-- Encomendas e pagamentos são criados no servidor (service role) a partir do
-- checkout da Stripe; o cliente só lê os seus.
create policy "encomendas: cliente vê as suas" on public.orders for select to authenticated
  using (client_id = public.current_profile_id() or public.is_staff());
create policy "encomendas: staff gere" on public.orders for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "itens: segue a encomenda" on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_id and (o.client_id = public.current_profile_id() or public.is_staff())
  ));
create policy "itens: staff gere" on public.order_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "pagamentos: cliente vê os seus" on public.payments for select to authenticated
  using (client_id = public.current_profile_id() or public.is_staff());
create policy "pagamentos: staff regista" on public.payments for insert to authenticated with check (public.is_staff());
create policy "pagamentos: admin corrige" on public.payments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Fidelidade --------------------------------------------------------------------
create policy "pontos: cliente vê os seus" on public.loyalty_transactions for select to authenticated
  using (client_id = public.current_profile_id() or public.is_staff());
create policy "pontos: staff lança (resgates/ajustes)" on public.loyalty_transactions for insert to authenticated
  with check (public.is_staff());

create policy "resgates: cliente vê e pede os seus" on public.loyalty_redemptions for select to authenticated
  using (client_id = public.current_profile_id() or public.is_staff());
create policy "resgates: cliente pede" on public.loyalty_redemptions for insert to authenticated
  with check (client_id = public.current_profile_id() and status = 'pending');

-- Painel ------------------------------------------------------------------------
create policy "eventos: staff lê"           on public.admin_events for select to authenticated using (public.is_staff());
create policy "eventos: staff marca lidos"  on public.admin_events for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- =============================================================================
-- Defesa extra para dados pessoais
-- A chave pública (anon) vai no browser de qualquer visitante: tiramos-lhe QUALQUER
-- acesso às tabelas com dados de clientes, mesmo que um dia alguém crie uma
-- política RLS por engano. O site lê estes dados só pelo servidor (DATABASE_URL).
-- =============================================================================
revoke all on table
  public.profiles, public.appointments, public.appointment_services, public.client_notes,
  public.payments, public.orders, public.order_items, public.loyalty_transactions,
  public.loyalty_redemptions, public.waitlist, public.reviews, public.admin_events,
  public.blocked_slots, public.staff_working_hours,
  public.manager_notes, public.integration_secrets, public.stripe_events
from anon;
grant select on public.reviews to anon;  -- só as publicadas passam no RLS (depoimentos)

-- notas do gerente e credenciais: nem utilizadores autenticados (só o servidor)
revoke all on table public.manager_notes, public.integration_secrets, public.stripe_events, public.push_subscriptions from authenticated;
revoke all on table public.push_subscriptions from anon;
revoke all on table public.media from anon, authenticated;

-- =============================================================================
-- Permissões de funções e views
-- =============================================================================
revoke execute on function public.book_appointment(uuid[], timestamptz, uuid, uuid, text, text, public.appointment_source, text) from public, anon;
revoke execute on function public.cancel_appointment(uuid, text) from public, anon;
revoke execute on function public.reschedule_appointment(uuid, timestamptz, uuid) from public, anon;
revoke execute on function public.expire_pending_holds() from public, anon, authenticated;
revoke execute on function public.link_or_create_profile(auth.users) from public, anon, authenticated;

grant execute on function public.get_available_slots(date, uuid[], uuid, uuid) to anon, authenticated;
grant execute on function public.get_month_availability(date, date, uuid[]) to anon, authenticated;
grant execute on function public.off_peak_discount(timestamptz, uuid[]) to anon, authenticated;
grant execute on function public.book_appointment(uuid[], timestamptz, uuid, uuid, text, text, public.appointment_source, text) to authenticated;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
grant execute on function public.reschedule_appointment(uuid, timestamptz, uuid) to authenticated;

grant select on public.public_staff to anon, authenticated;
revoke all on public.v_daily_revenue, public.v_staff_commissions from anon;
grant select on public.v_daily_revenue, public.v_staff_commissions to authenticated;

-- =============================================================================
-- Realtime (NotificationBar e agenda ao vivo)
-- =============================================================================
alter publication supabase_realtime add table public.appointments, public.waitlist, public.admin_events;

-- =============================================================================
-- Storage
-- =============================================================================
insert into storage.buckets (id, name, public) values
  ('gallery',  'gallery',  true),
  ('products', 'products', true),
  ('avatars',  'avatars',  true)
on conflict (id) do nothing;

create policy "storage: staff envia galeria/produtos" on storage.objects for insert to authenticated
  with check (bucket_id in ('gallery', 'products') and public.is_staff());
create policy "storage: staff altera galeria/produtos" on storage.objects for update to authenticated
  using (bucket_id in ('gallery', 'products') and public.is_staff());
create policy "storage: staff apaga galeria/produtos" on storage.objects for delete to authenticated
  using (bucket_id in ('gallery', 'products') and public.is_staff());

-- avatars/<auth.uid()>/ficheiro.jpg
create policy "storage: cada um gere o seu avatar" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- Opcional: tarefas agendadas (ativar a extensão pg_cron em Database → Extensions)
-- =============================================================================
-- select cron.schedule('expirar-holds', '*/5 * * * *', $$ select public.expire_pending_holds() $$);
