-- =============================================================================
-- 007 · Convites com recompensa em escada  (+5% por convidada, até 50%)
--
-- Só acrescenta. Nada é apagado nem reescrito, por isso pode correr sobre a
-- base que já está em produção, e correr duas vezes não faz mal.
--
-- Como funciona, em três linhas:
--   1. cada ficha ganha um `invite_code` e um endereço /convite/<código>;
--   2. quem chega por lá fica ligado a quem convidou (tabela `invites`),
--      ainda "pending";
--   3. quando a PRIMEIRA marcação dessa pessoa passa a "completed", o convite
--      vale e quem convidou sobe um degrau.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Texto sem acentos, para a busca por nome
--
-- A extensão `unaccent` existe no Supabase mas não no PGlite, que é o que corre
-- em desenvolvimento. Com translate() a regra é a mesma nos dois sítios — e é
-- `immutable`, por isso pode entrar num índice.
-- -----------------------------------------------------------------------------
create or replace function public.norm_text(p text)
returns text language sql immutable parallel safe as $$
  select lower(translate(
    coalesce(p, ''),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝÿý',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'))
$$;

create index if not exists profiles_norm_name_idx
  on public.profiles using gin (public.norm_text(name) gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Colunas novas
-- -----------------------------------------------------------------------------
alter table public.profiles
  -- Distinto do `loyalty_code`: aquele é o QR do cartão de carimbos. Misturar
  -- os dois faria o QR do convite dar entrada no cartão de outra pessoa.
  add column if not exists invite_code text,
  add column if not exists invited_by uuid references public.profiles (id) on delete set null,
  -- Desconto disponível AGORA (0–100). Em modo permanente é sempre o degrau
  -- atual; em modo consumível desce a 0 depois de usado.
  add column if not exists invite_discount_percent numeric(5,2) not null default 0
    check (invite_discount_percent between 0 and 100),
  -- O dono mexeu à mão: a escada deixa de o sobrepor sozinha.
  add column if not exists invite_discount_manual boolean not null default false;

update public.profiles
   set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
 where invite_code is null;

alter table public.profiles alter column invite_code set default
  upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

create unique index if not exists profiles_invite_code_key on public.profiles (invite_code);

alter table public.salon_settings
  add column if not exists invite_discount_step numeric(5,2) not null default 5
    check (invite_discount_step between 0 and 100),
  add column if not exists invite_discount_max numeric(5,2) not null default 50
    check (invite_discount_max between 0 and 100),
  -- false = permanente (o desconto fica); true = consumível (volta a 0 depois de usado)
  add column if not exists invite_discount_consumable boolean not null default false;

-- Quanto é que esta marcação gastou do desconto de convite. Serve para o
-- devolver se a marcação for cancelada — sem isto, cancelar uma marcação
-- queimava o desconto de uma convidada que nunca chegou a ser atendida.
alter table public.appointments
  add column if not exists invite_discount_applied numeric(5,2) not null default 0
    check (invite_discount_applied between 0 and 100);

-- -----------------------------------------------------------------------------
-- Convites
-- -----------------------------------------------------------------------------
create table if not exists public.invites (
  id             uuid primary key default gen_random_uuid(),
  inviter_id     uuid not null references public.profiles (id) on delete cascade,
  invitee_id     uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'valid', 'blocked')),
  -- a marcação concluída que o tornou válido
  appointment_id uuid references public.appointments (id) on delete set null,
  created_at     timestamptz not null default now(),
  validated_at   timestamptz,
  -- Antifraude 1: ninguém se convida a si mesmo.
  constraint invites_not_self check (inviter_id <> invitee_id),
  -- Antifraude 2: cada ficha só pode ser convidada por UMA pessoa.
  -- (O mesmo telefone/e-mail já é uma ficha só — profiles_phone_key e
  --  profiles_email_key — por isso isto chega para "só conta uma vez".)
  constraint invites_one_inviter unique (invitee_id)
);

create index if not exists invites_inviter_idx on public.invites (inviter_id, created_at desc);

alter table public.invites enable row level security;
revoke all on table public.invites from anon, authenticated;

-- -----------------------------------------------------------------------------
-- A escada
-- -----------------------------------------------------------------------------

-- Degrau atual = número de convites válidos (o que a barra de progresso mostra).
create or replace function public.invite_level(p_client uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.invites
   where inviter_id = p_client and status = 'valid'
$$;

-- Recalcula o desconto de quem convidou, respeitando o modo escolhido no painel.
create or replace function public.refresh_invite_discount(p_client uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  s     public.salon_settings;
  v_lvl int;
  v_new numeric;
  v_man boolean;
begin
  select * into s from public.salon_settings where id = 1;
  select invite_discount_manual into v_man from public.profiles where id = p_client;
  -- Mexido à mão no painel: a escada não lhe toca mais.
  if coalesce(v_man, false) then
    return (select invite_discount_percent from public.profiles where id = p_client);
  end if;

  v_lvl := public.invite_level(p_client);
  if coalesce(s.invite_discount_consumable, false) then
    -- Consumível: soma um degrau ao que ainda está por usar.
    v_new := least(coalesce(s.invite_discount_max, 50),
                   (select invite_discount_percent from public.profiles where id = p_client)
                     + coalesce(s.invite_discount_step, 5));
  else
    -- Permanente: o desconto É o degrau. Recalcular em vez de somar torna isto
    -- idempotente — correr duas vezes dá o mesmo, e um convite apagado desce
    -- o desconto sozinho.
    v_new := least(coalesce(s.invite_discount_max, 50), v_lvl * coalesce(s.invite_discount_step, 5));
  end if;

  update public.profiles set invite_discount_percent = v_new where id = p_client;
  return v_new;
end $$;

-- Primeira marcação concluída da convidada → o convite passa a válido.
create or replace function public.tg_validate_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_inviter uuid;
  v_antes   int;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' or new.client_id is null then
    return new;
  end if;

  -- "a PRIMEIRA marcação dela": se já tinha outra concluída, não conta.
  -- É isto que impede convidar quem já era cliente da casa.
  select count(*) into v_antes
    from public.appointments a
   where a.client_id = new.client_id and a.status = 'completed' and a.id <> new.id;
  if v_antes > 0 then
    return new;
  end if;

  update public.invites
     set status = 'valid', validated_at = now(), appointment_id = new.id
   where invitee_id = new.client_id and status = 'pending'
   returning inviter_id into v_inviter;

  if v_inviter is not null then
    perform public.refresh_invite_discount(v_inviter);
  end if;
  return new;
end $$;

drop trigger if exists validate_invite on public.appointments;
create trigger validate_invite after update of status on public.appointments
  for each row execute function public.tg_validate_invite();

-- Marcação cancelada → devolve o desconto que ela tinha gasto.
create or replace function public.tg_refund_invite_discount()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and new.invite_discount_applied > 0 and new.client_id is not null then
    update public.profiles
       set invite_discount_percent = greatest(invite_discount_percent, new.invite_discount_applied)
     where id = new.client_id;
  end if;
  return new;
end $$;

drop trigger if exists refund_invite_discount on public.appointments;
create trigger refund_invite_discount after update of status on public.appointments
  for each row execute function public.tg_refund_invite_discount();

-- -----------------------------------------------------------------------------
-- book_appointment: juntar o desconto de convite ao de horário
--
-- Único sítio alterado face ao original: o cálculo de v_disc, o registo de
-- invite_discount_applied e o consumo. O resto é igual, linha a linha.
--
-- Os dois descontos NÃO se somam, fica o maior. Somar 50% de convites com 20%
-- de hora vazia dava 70% — nenhum salão quer assinar isso sem dar por ela.
-- -----------------------------------------------------------------------------
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
  v_offpeak  numeric;
  v_invite   numeric;
  v_used     numeric := 0;
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

  select id into v_main
    from public.services
   where id = any (p_service_ids)
   order by is_addon, array_position(p_service_ids, id)
   limit 1;

  if v_trusted and p_staff_id is not null then
    v_staff := p_staff_id;
  else
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

  v_offpeak := public.off_peak_discount(p_start, p_service_ids);
  v_invite  := coalesce((select invite_discount_percent from public.profiles where id = v_client), 0);
  v_disc    := greatest(v_offpeak, v_invite);
  -- Só se considera "gasto" quando o desconto de convite foi mesmo o que valeu.
  if v_invite > 0 and v_invite >= v_offpeak then
    v_used := v_invite;
  end if;

  v_total := round(v_price * (1 - v_disc / 100), 2);
  v_deposit := round(v_dep_fixed + v_dep_base * (1 - v_disc / 100) * s.deposit_percent / 100, 2);
  if v_deposit > 0 then
    v_deposit := least(v_total, greatest(v_deposit, s.min_deposit));
  end if;

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
      notes, hold_expires_at, created_by, invite_discount_applied
    ) values (
      v_client, v_staff, v_main, p_start, p_start + make_interval(mins => v_duration),
      v_status, p_source, v_total, round(v_price - v_total, 2), v_deposit,
      nullif(trim(p_guest_name), ''), nullif(trim(p_guest_phone), ''), p_notes,
      case when v_status = 'pending' and v_deposit > 0 then now() + make_interval(mins => s.hold_minutes) end,
      v_me, v_used
    )
    returning * into r;
  exception when exclusion_violation then
    raise exception 'SLOT_UNAVAILABLE';
  end;

  insert into public.appointment_services (appointment_id, service_id, price, duration_minutes, position)
  select r.id, sv.id, sv.price, sv.duration_minutes, array_position(p_service_ids, sv.id) - 1
    from public.services sv
   where sv.id = any (p_service_ids);

  -- Consumível: o desconto some depois de marcar. (Volta se cancelarem — ver
  -- tg_refund_invite_discount.)
  if v_used > 0 and coalesce(s.invite_discount_consumable, false) then
    update public.profiles set invite_discount_percent = 0 where id = v_client;
  end if;

  return r;
end $$;
