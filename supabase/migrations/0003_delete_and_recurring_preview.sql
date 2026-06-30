-- US-HOME — remoção do histórico, exclusão definitiva e previsibilidade de recorrentes.

-- Remove a permissão da aba Histórico de perfis existentes.
update public.profiles
set permissions = permissions - 'historico'
where permissions ? 'historico';

-- Permite apagar uma recorrente modelo junto com suas instâncias geradas.
alter table public.expenses
  drop constraint if exists expenses_template_id_fkey;

alter table public.expenses
  add constraint expenses_template_id_fkey
  foreign key (template_id) references public.expenses(id) on delete cascade;

-- Novos perfis não recebem mais a permissão de Histórico.
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
    '{"despesas": true, "imprevistos": false, "metas": false, "saldos": false}'::jsonb
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A ação de excluir despesa agora apaga o registro e seus dados dependentes.
create or replace function public.cancel_expense(p_expense_id uuid)
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
    raise exception 'sem permissão para excluir esta despesa';
  end if;

  delete from public.expenses where id = p_expense_id;
end;
$$;

-- Gera instâncias das despesas recorrentes para o mês atual e para o próximo mês.
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
      continue when exists (
        select 1 from public.expenses
        where template_id = v_template.id and year_month = v_target_month
      );

      insert into public.expenses (description, amount, kind, due_date, template_id, year_month, created_by, paid_by, split_method)
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
  end loop;
end;
$$;
