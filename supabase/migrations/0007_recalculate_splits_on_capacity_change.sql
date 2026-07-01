-- Ao atualizar capacidades, recalcula splits das recorrentes pendentes (não pagas).
-- Despesas já pagas permanecem intocadas.

create or replace function public.set_payment_capacities(
  p_capacities jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_total numeric := 0;
  v_expense record;
  v_participants uuid[];
  v_total_percent numeric;
  v_count integer;
  v_running numeric;
  v_idx integer;
  v_owed numeric;
  rec record;
begin
  if not public.is_admin() then
    raise exception 'sem permissão';
  end if;

  -- Valida soma = 100
  for v_item in select * from jsonb_array_elements(p_capacities)
  loop
    v_total := v_total + (v_item->>'percent')::numeric;
  end loop;
  if abs(v_total - 100) > 0.01 then
    raise exception 'a soma das capacidades precisa ser 100%%, atual: %', v_total;
  end if;

  -- Encerra vigências anteriores
  update public.payment_capacity_history
  set effective_to = now()
  where effective_to is null;

  -- Insere novas vigências
  for v_item in select * from jsonb_array_elements(p_capacities)
  loop
    insert into public.payment_capacity_history (profile_id, percent, effective_from, set_by)
    values (
      (v_item->>'profile_id')::uuid,
      (v_item->>'percent')::numeric,
      now(),
      auth.uid()
    );
  end loop;

  -- Recalcula splits das recorrentes pendentes (payment_status = 'pendente' e split_method = 'capacidade')
  for v_expense in
    select e.* from public.expenses e
    where e.kind = 'recorrente'
      and e.template_id is not null
      and e.payment_status = 'pendente'
      and e.status = 'ativa'
      and e.split_method = 'capacidade'
  loop
    -- Participantes atuais desta instância
    select array_agg(profile_id order by profile_id) into v_participants
    from public.expense_splits where expense_id = v_expense.id;

    if v_participants is null then
      continue;
    end if;

    -- Soma das novas capacidades dos participantes
    select sum(h.percent) into v_total_percent
    from public.payment_capacity_history h
    where h.effective_to is null and h.profile_id = any(v_participants);

    if v_total_percent is null or v_total_percent = 0 then
      continue;
    end if;

    -- Remove splits antigos
    delete from public.expense_splits where expense_id = v_expense.id;

    -- Recria com novas capacidades
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
        v_owed := round(v_expense.amount - v_running, 2);
      else
        v_owed := round(v_expense.amount * rec.percent / v_total_percent, 2);
        v_running := v_running + v_owed;
      end if;
      insert into public.expense_splits (expense_id, profile_id, percent_used, amount_owed)
      values (v_expense.id, rec.profile_id, round(rec.percent / v_total_percent * 100, 2), v_owed);
    end loop;
  end loop;
end;
$$;
