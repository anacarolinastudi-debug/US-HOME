-- Permite reverter pagamento de uma despesa (volta para pendente).
-- Também pode alterar o pagador sem reverter (se a despesa já for paga).
create or replace function public.revert_expense_payment(
  p_expense_id uuid,
  p_new_paid_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.expenses
    where id = p_expense_id
      and (created_by = auth.uid() or public.is_admin())
  ) then
    raise exception 'sem permissão';
  end if;

  if p_new_paid_by is not null then
    -- só troca o pagador, mantém como paga
    update public.expenses
    set paid_by = p_new_paid_by
    where id = p_expense_id;
  else
    -- reverte para pendente
    update public.expenses
    set payment_status = 'pendente',
        paid_by = null,
        paid_at = null
    where id = p_expense_id;
  end if;
end;
$$;
