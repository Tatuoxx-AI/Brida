-- =============================================================================
-- 008 · Agente de WhatsApp (central OpenWA) + correção de segurança
--
-- Só acrescenta. Nada é apagado nem reescrito, por isso pode correr sobre a
-- base que já está em produção, e correr duas vezes não faz mal.
--
-- A FALHA: cancel_appointment e reschedule_appointment só verificam o dono e o
-- prazo de cancelamento quando auth.uid() não é nulo. Chamadas pelo servidor
-- (lib/db.ts liga-se como dono da base, auth.uid() é sempre nulo) saltavam as
-- duas verificações — um agente que as usasse podia cancelar a marcação de
-- outra pessoa só por saber o código, e fora do prazo.
--
-- A CORREÇÃO: o agente nunca usa essas duas funções diretamente. Usa as
-- agent_* abaixo, que recebem o cliente de forma explícita (a ficha ligada ao
-- telefone do WhatsApp) e fazem SEMPRE as duas verificações, na mesma
-- transação e com a linha trancada (for update). Só o servidor as executa:
-- anon e authenticated ficam sem permissão.
-- =============================================================================

-- Código como o cliente o escreve ("#a1b2c3d4", " A1B2C3D4 ") → "A1B2C3D4"
create or replace function public.normalize_appointment_code(p_code text)
returns text language sql immutable parallel safe as $$
  select upper(ltrim(btrim(coalesce(p_code, '')), '#'))
$$;

-- Marcações futuras e ativas de UM cliente (o do telefone do WhatsApp).
create or replace function public.agent_client_appointments(p_client uuid)
returns table (
  code        text,
  start_time  timestamptz,
  end_time    timestamptz,
  status      public.appointment_status,
  services    text,
  staff_name  text,
  total_price numeric
)
language sql stable security definer set search_path = '' as $$
  select a.code, a.start_time, a.end_time, a.status,
         coalesce((select string_agg(sv.name, ' + ' order by x.position)
                     from public.appointment_services x
                     join public.services sv on sv.id = x.service_id
                    where x.appointment_id = a.id), ''),
         st.name, a.total_price
    from public.appointments a
    left join public.profiles st on st.id = a.staff_id  -- profissional apagado: a marcação continua a aparecer
   where p_client is not null
     and a.client_id = p_client
     and a.status in ('pending', 'confirmed')
     and a.start_time > now()
   order by a.start_time
   limit 20
$$;

-- Tranca e devolve a marcação SE for deste cliente; valida estado e prazo.
-- Erros: PERMISSION_DENIED (sem cliente), NOT_FOUND (não existe ou é de outra
-- pessoa — nunca se revela qual), INVALID_STATUS, CANCELLATION_WINDOW.
create or replace function public.agent_lock_own_appointment(p_code text, p_client uuid)
returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare
  s public.salon_settings;
  r public.appointments;
begin
  if p_client is null then
    raise exception 'PERMISSION_DENIED';
  end if;
  select * into s from public.salon_settings where id = 1;
  select * into r
    from public.appointments
   where code = public.normalize_appointment_code(p_code)
     and client_id = p_client
     for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if r.status not in ('pending', 'confirmed') then
    raise exception 'INVALID_STATUS';
  end if;
  if r.start_time - now() < make_interval(hours => s.cancellation_window_hours) then
    raise exception 'CANCELLATION_WINDOW'
      using hint = format('Alterações por mensagem até %s h antes. Contacte o salão.', s.cancellation_window_hours);
  end if;
  return r;
end $$;

create or replace function public.agent_cancel_appointment(p_code text, p_client uuid, p_reason text default null)
returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare
  r public.appointments;
begin
  r := public.agent_lock_own_appointment(p_code, p_client);
  update public.appointments
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = coalesce(nullif(btrim(p_reason), ''), 'Cancelado pela cliente no WhatsApp'),
         cancelled_by = p_client
   where id = r.id
  returning * into r;
  return r;
end $$;

create or replace function public.agent_reschedule_appointment(p_code text, p_client uuid, p_start timestamptz)
returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare
  r public.appointments;
begin
  r := public.agent_lock_own_appointment(p_code, p_client);
  if p_start is null or p_start <= now() then
    raise exception 'SLOT_UNAVAILABLE';
  end if;
  -- Dono e prazo já verificados acima; reschedule_appointment confirma que o
  -- novo horário está livre (sem contar com a própria marcação) e recalcula o desconto.
  return public.reschedule_appointment(r.id, p_start, null);
end $$;

revoke execute on function public.agent_client_appointments(uuid) from public, anon, authenticated;
revoke execute on function public.agent_lock_own_appointment(text, uuid) from public, anon, authenticated;
revoke execute on function public.agent_cancel_appointment(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.agent_reschedule_appointment(text, uuid, timestamptz) from public, anon, authenticated;

-- Confirmação por mensagem ("CONFIRMAR #A1B2C3D4", o texto que o site prepara
-- para o WhatsApp do salão). Só confirma se a marcação for do número que escreve.
-- Já confirmada: devolve-a sem erro. Com sinal por pagar: DEPOSIT_REQUIRED.
-- Erros: PERMISSION_DENIED, NOT_FOUND, INVALID_STATUS, DEPOSIT_REQUIRED.
create or replace function public.agent_confirm_appointment(p_code text, p_client uuid)
returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare
  r public.appointments;
begin
  if p_client is null then
    raise exception 'PERMISSION_DENIED';
  end if;
  select * into r
    from public.appointments
   where code = public.normalize_appointment_code(p_code)
     and client_id = p_client
     for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if r.status = 'confirmed' then
    return r;
  end if;
  if r.status <> 'pending' or r.start_time <= now()
     or (r.hold_expires_at is not null and r.hold_expires_at <= now()) then
    raise exception 'INVALID_STATUS';
  end if;
  if r.deposit_amount > 0 and not r.deposit_paid then
    raise exception 'DEPOSIT_REQUIRED';
  end if;
  update public.appointments set status = 'confirmed' where id = r.id returning * into r;
  return r;
end $$;

revoke execute on function public.agent_confirm_appointment(text, uuid) from public, anon, authenticated;
