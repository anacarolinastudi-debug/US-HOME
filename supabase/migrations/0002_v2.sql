-- Nossa Casa — fase 2: cadastro livre, participantes/forma de rateio por despesa, "quem pagou"
-- Rodar este arquivo inteiro no SQL Editor do Supabase (ou via `supabase db push`).

-- =========================================================
-- Schema
-- =========================================================
alter table public.expenses
  add column paid_by uuid references public.profiles(id),
  add column split_method text check (split_method in ('capacidade', 'igual', 'manual'));

update public.expenses set split_method = 'capacidade' where split_method is null;
update public.expenses set paid_by = created_by where paid_by is null;

-- =========================================================
-- Permissões padrão para conta criada por cadastro livre
-- =========================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, permissions)
  values (
    new.id,
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1),
    '{"despesas": true, "imprevistos": false, "metas": false, "historico": false, "saldos": false}'::jsonb
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- =========================================================
-- RPC: complete_signup_profile — pessoa define seu próprio usuário/nome após o cadastro livre
-- =========================================================
create or replace function public.complete_signup_profile(p_username text, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if p_username is null or length(trim(p_username)) = 0 or p_display_name is null or length(trim(p_display_name)) = 0 then
    raise exception 'usuário e nome são obrigatórios';
  end if;

  begin
    update public.profiles
      set username = lower(trim(p_username)), display_name = trim(p_display_name)
      where id = auth.uid();
  exception when unique_violation then
    raise exception 'esse nome de usuário já está em uso';
  end;
end;
$$;

-- =========================================================
-- RPC: create_expense (v2) — participantes, forma de rateio, quem pagou
-- =========================================================
drop function if exists public.create_expense(text, numeric, text, integer, date);

create or replace function public.create_expense(
  p_description text,
  p_amount numeric,
  p_kind text,
  p_recurrence_day integer default null,
  p_due_date date default null,
  p_paid_by uuid default null,
  p_participant_ids uuid[] default null,
  p_split_method text default 'capacidade',
  p_manual_amounts jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_paid_by uuid := coalesce(p_paid_by, auth.uid());
  v_participants uuid[];
  v_total_percent numeric;
  v_running numeric := 0;
  v_count integer;
  v_idx integer := 0;
  v_item jsonb;
  v_owed numeric;
  rec record;
begin
  if p_split_method not in ('capacidade', 'igual', 'manual') then
    raise exception 'método de rateio inválido: %', p_split_method;
  end if;

  if p_split_method = 'manual' then
    if p_manual_amounts is null or jsonb_array_length(p_manual_amounts) = 0 then
      raise exception 'informe os valores manuais por participante';
    end if;
    select array_agg((item->>'profile_id')::uuid) into v_participants
    from jsonb_array_elements(p_manual_amounts) as item;
    select sum((item->>'amount')::numeric) into v_running
    from jsonb_array_elements(p_manual_amounts) as item;
    if abs(v_running - p_amount) > 0.01 then
      raise exception 'a soma dos valores manuais (%) precisa ser igual ao valor total (%)', v_running, p_amount;
    end if;
  else
    v_participants := coalesce(p_participant_ids, (select array_agg(id) from public.profiles where active = true));
    if v_participants is null or array_length(v_participants, 1) = 0 then
      raise exception 'selecione ao menos um participante';
    end if;
  end if;

  insert into public.expenses (description, amount, kind, recurrence_day, due_date, paid_by, split_method, created_by)
  values (p_description, p_amount, p_kind, p_recurrence_day, p_due_date, v_paid_by, p_split_method, auth.uid())
  returning id into v_expense_id;

  if p_split_method = 'capacidade' then
    select sum(h.percent) into v_total_percent
    from public.payment_capacity_history h
    where h.effective_to is null and h.profile_id = any(v_participants);

    if v_total_percent is null or v_total_percent = 0 then
      raise exception 'os participantes selecionados não têm capacidade de pagamento definida';
    end if;

    v_count := array_length(v_participants, 1);
    v_running := 0;
    v_idx := 0;
    for rec in
      select h.profile_id, h.percent
      from public.payment_capacity_history h
      where h.effective_to is null and h.profile_id = any(v_participants)
      order by h.profile_id
    loop
      v_idx := v_idx + 1;
      if v_idx = v_count then
        v_owed := round(p_amount - v_running, 2);
      else
        v_owed := round(p_amount * rec.percent / v_total_percent, 2);
        v_running := v_running + v_owed;
      end if;
      insert into public.expense_splits (expense_id, profile_id, percent_used, amount_owed)
      values (v_expense_id, rec.profile_id, round(rec.percent / v_total_percent * 100, 2), v_owed);
    end loop;

  elsif p_split_method = 'igual' then
    v_count := array_length(v_participants, 1);
    v_running := 0;
    v_idx := 0;
    for rec in select unnest(v_participants) as profile_id order by 1
    loop
      v_idx := v_idx + 1;
      if v_idx = v_count then
        v_owed := round(p_amount - v_running, 2);
      else
        v_owed := round(p_amount / v_count, 2);
        v_running := v_running + v_owed;
      end if;
      insert into public.expense_splits (expense_id, profile_id, percent_used, amount_owed)
      values (v_expense_id, rec.profile_id, round(100.0 / v_count, 2), v_owed);
    end loop;

  else
    for v_item in select * from jsonb_array_elements(p_manual_amounts)
    loop
      insert into public.expense_splits (expense_id, profile_id, percent_used, amount_owed)
      values (
        v_expense_id,
        (v_item->>'profile_id')::uuid,
        round((v_item->>'amount')::numeric / p_amount * 100, 2),
        round((v_item->>'amount')::numeric, 2)
      );
    end loop;
  end if;

  return v_expense_id;
end;
$$;

-- =========================================================
-- RPC: update_expense (v2) — rescala os splits existentes pelas proporções já gravadas
-- =========================================================
create or replace function public.update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_count integer;
  v_running numeric := 0;
  v_idx integer := 0;
  v_owed numeric;
  rec record;
begin
  select * into v_old from public.expenses where id = p_expense_id;
  if v_old is null then
    raise exception 'despesa não encontrada';
  end if;
  if not (public.is_admin() or v_old.created_by = auth.uid()) then
    raise exception 'sem permissão para editar esta despesa';
  end if;

  if v_old.description is distinct from p_description then
    insert into public.expense_edits (expense_id, field, old_value, new_value, changed_by)
    values (p_expense_id, 'description', v_old.description, p_description, auth.uid());
  end if;

  if v_old.amount is distinct from p_amount then
    insert into public.expense_edits (expense_id, field, old_value, new_value, changed_by)
    values (p_expense_id, 'amount', v_old.amount::text, p_amount::text, auth.uid());

    select count(*) into v_count from public.expense_splits where expense_id = p_expense_id;

    for rec in
      select profile_id, percent_used from public.expense_splits
      where expense_id = p_expense_id order by profile_id
    loop
      v_idx := v_idx + 1;
      if v_idx = v_count then
        v_owed := round(p_amount - v_running, 2);
      else
        v_owed := round(p_amount * rec.percent_used / 100, 2);
        v_running := v_running + v_owed;
      end if;
      update public.expense_splits set amount_owed = v_owed
        where expense_id = p_expense_id and profile_id = rec.profile_id;
    end loop;
  end if;

  update public.expenses set description = p_description, amount = p_amount where id = p_expense_id;
end;
$$;

-- =========================================================
-- RPC agendada (v2): clona paid_by/split_method/participantes do template
-- =========================================================
create or replace function public.generate_monthly_recurring_expenses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_current_month text := to_char(now(), 'YYYY-MM');
  v_new_id uuid;
  v_participants uuid[];
  v_total_percent numeric;
  v_count integer;
  v_running numeric;
  v_idx integer;
  v_owed numeric;
  rec record;
begin
  for v_template in
    select * from public.expenses
    where kind = 'recorrente' and template_id is null and status = 'ativa'
  loop
    continue when exists (
      select 1 from public.expenses
      where template_id = v_template.id and year_month = v_current_month
    );

    insert into public.expenses (description, amount, kind, due_date, template_id, year_month, created_by, paid_by, split_method)
    values (
      v_template.description,
      v_template.amount,
      'recorrente',
      make_date(extract(year from now())::int, extract(month from now())::int, coalesce(v_template.recurrence_day, 1)),
      v_template.id,
      v_current_month,
      v_template.created_by,
      v_template.paid_by,
      v_template.split_method
    )
    returning id into v_new_id;

    select array_agg(profile_id order by profile_id) into v_participants
    from public.expense_splits where expense_id = v_template.id;

    if v_participants is null then
      continue;
    end if;

    v_count := array_length(v_participants, 1);
    v_running := 0;
    v_idx := 0;

    if v_template.split_method = 'capacidade' then
      select sum(h.percent) into v_total_percent
      from public.payment_capacity_history h
      where h.effective_to is null and h.profile_id = any(v_participants);
      if v_total_percent is null or v_total_percent = 0 then
        v_total_percent := 100;
      end if;

      for rec in
        select h.profile_id, h.percent
        from public.payment_capacity_history h
        where h.effective_to is null and h.profile_id = any(v_participants)
        order by h.profile_id
      loop
        v_idx := v_idx + 1;
        if v_idx = v_count then
          v_owed := round(v_template.amount - v_running, 2);
        else
          v_owed := round(v_template.amount * rec.percent / v_total_percent, 2);
          v_running := v_running + v_owed;
        end if;
        insert into public.expense_splits (expense_id, profile_id, percent_used, amount_owed)
        values (v_new_id, rec.profile_id, round(rec.percent / v_total_percent * 100, 2), v_owed);
      end loop;
    else
      for rec in
        select profile_id, percent_used from public.expense_splits
        where expense_id = v_template.id order by profile_id
      loop
        v_idx := v_idx + 1;
        if v_idx = v_count then
          v_owed := round(v_template.amount - v_running, 2);
        else
          v_owed := round(v_template.amount * rec.percent_used / 100, 2);
          v_running := v_running + v_owed;
        end if;
        insert into public.expense_splits (expense_id, profile_id, percent_used, amount_owed)
        values (v_new_id, rec.profile_id, rec.percent_used, v_owed);
      end loop;
    end if;
  end loop;
end;
$$;
