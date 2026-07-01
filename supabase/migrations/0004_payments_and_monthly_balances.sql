-- US-HOME — pagamentos, vigência de recorrentes e quitação de saldos mensais.

alter table public.expenses
  add column if not exists payment_status text not null default 'pendente'
    check (payment_status in ('pendente', 'paga')),
  add column if not exists paid_at timestamptz,
  add column if not exists recurrence_start_date date,
  add column if not exists recurrence_end_date date;

-- Por solicitação, despesas já registradas passam a ficar sem pagamento marcado.
update public.expenses
set payment_status = 'pendente',
    paid_by = null,
    paid_at = null;

update public.expenses
set recurrence_start_date = coalesce(due_date, created_at::date)
where kind = 'recorrente'
  and template_id is null
  and recurrence_start_date is null;

create table if not exists public.balance_settlements (
  id uuid primary key default gen_random_uuid(),
  year_month text not null,
  debtor_id uuid not null references public.profiles(id),
  creditor_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null check (amount >= 0),
  settled_by uuid references public.profiles(id),
  settled_at timestamptz not null default now(),
  note text,
  unique (year_month, debtor_id, creditor_id)
);

alter table public.balance_settlements enable row level security;

drop policy if exists "balance_settlements_select_authenticated" on public.balance_settlements;
create policy "balance_settlements_select_authenticated" on public.balance_settlements
  for select to authenticated using (true);

create or replace function public.mark_expense_paid(p_expense_id uuid, p_paid_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
begin
  select * into v_old from public.expenses where id = p_expense_id;
  if v_old is null then
    raise exception 'despesa não encontrada';
  end if;
  if not (public.is_admin() or v_old.created_by = auth.uid()) then
    raise exception 'sem permissão para registrar pagamento desta despesa';
  end if;

  update public.expenses
  set paid_by = p_paid_by,
      payment_status = 'paga',
      paid_at = now()
  where id = p_expense_id;
end;
$$;

create or replace function public.settle_balance(
  p_year_month text,
  p_debtor_id uuid,
  p_creditor_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  insert into public.balance_settlements (year_month, debtor_id, creditor_id, amount, settled_by)
  values (p_year_month, p_debtor_id, p_creditor_id, p_amount, auth.uid())
  on conflict (year_month, debtor_id, creditor_id)
  do update set amount = excluded.amount, settled_by = auth.uid(), settled_at = now();
end;
$$;

drop function if exists public.create_expense(text, numeric, text, integer, date, uuid, uuid[], text, jsonb);
drop function if exists public.create_expense(text, numeric, text, integer, date);

create or replace function public.create_expense(
  p_description text,
  p_amount numeric,
  p_kind text,
  p_recurrence_day integer default null,
  p_recurrence_start_date date default null,
  p_recurrence_end_date date default null,
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

  insert into public.expenses (
    description, amount, kind, recurrence_day, recurrence_start_date, recurrence_end_date,
    due_date, paid_by, payment_status, paid_at, split_method, created_by
  )
  values (
    p_description, p_amount, p_kind, p_recurrence_day, p_recurrence_start_date, p_recurrence_end_date,
    p_due_date, p_paid_by, case when p_paid_by is null then 'pendente' else 'paga' end,
    case when p_paid_by is null then null else now() end, p_split_method, auth.uid()
  )
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

drop function if exists public.update_expense(uuid, text, numeric);

create or replace function public.update_expense(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_recurrence_day integer default null,
  p_recurrence_start_date date default null,
  p_recurrence_end_date date default null
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

  if v_old.amount is distinct from p_amount then
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

  update public.expenses
  set description = p_description,
      amount = p_amount,
      recurrence_day = case when kind = 'recorrente' and template_id is null then p_recurrence_day else recurrence_day end,
      recurrence_start_date = case when kind = 'recorrente' and template_id is null then p_recurrence_start_date else recurrence_start_date end,
      recurrence_end_date = case when kind = 'recorrente' and template_id is null then p_recurrence_end_date else recurrence_end_date end
  where id = p_expense_id;
end;
$$;

create or replace function public.generate_monthly_recurring_expenses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_target_date date;
  v_target_month text;
  v_offset integer;
  v_new_id uuid;
  v_participants uuid[];
  v_total_percent numeric;
  v_count integer;
  v_running numeric;
  v_idx integer;
  v_owed numeric;
  rec record;
begin
  for v_offset in 0..1
  loop
    v_target_date := date_trunc('month', now())::date + (v_offset || ' month')::interval;
    v_target_month := to_char(v_target_date, 'YYYY-MM');

    for v_template in
      select * from public.expenses
      where kind = 'recorrente' and template_id is null and status = 'ativa'
    loop
      continue when v_template.recurrence_start_date is not null
        and v_target_date < date_trunc('month', v_template.recurrence_start_date)::date;
      continue when v_template.recurrence_end_date is not null
        and v_target_date > date_trunc('month', v_template.recurrence_end_date)::date;
      continue when exists (
        select 1 from public.expenses
        where template_id = v_template.id and year_month = v_target_month
      );

      insert into public.expenses (
        description, amount, kind, due_date, template_id, year_month, created_by,
        paid_by, payment_status, paid_at, split_method, recurrence_day,
        recurrence_start_date, recurrence_end_date
      )
      values (
        v_template.description,
        v_template.amount,
        'recorrente',
        make_date(
          extract(year from v_target_date)::int,
          extract(month from v_target_date)::int,
          coalesce(v_template.recurrence_day, 1)
        ),
        v_template.id,
        v_target_month,
        v_template.created_by,
        null,
        'pendente',
        null,
        v_template.split_method,
        v_template.recurrence_day,
        v_template.recurrence_start_date,
        v_template.recurrence_end_date
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
  end loop;
end;
$$;
