-- Permite dia de vencimento até 31; geração mensal usa o último dia do mês quando ele não existir (ex: 30/31 em fevereiro)

alter table public.expenses drop constraint if exists expenses_recurrence_day_check;
alter table public.expenses add constraint expenses_recurrence_day_check check (recurrence_day between 1 and 31);

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
  v_last_day integer;
  v_day integer;
  rec record;
begin
  v_last_day := extract(day from (date_trunc('month', now()) + interval '1 month - 1 day'))::int;

  for v_template in
    select * from public.expenses
    where kind = 'recorrente' and template_id is null and status = 'ativa'
  loop
    continue when exists (
      select 1 from public.expenses
      where template_id = v_template.id and year_month = v_current_month
    );

    v_day := least(coalesce(v_template.recurrence_day, 1), v_last_day);

    insert into public.expenses (description, amount, kind, due_date, template_id, year_month, created_by, paid_by, split_method)
    values (
      v_template.description,
      v_template.amount,
      'recorrente',
      make_date(extract(year from now())::int, extract(month from now())::int, v_day),
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
