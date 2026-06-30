-- Nossa Casa — schema inicial
-- Rodar este arquivo inteiro no SQL Editor do Supabase (Dashboard > SQL Editor > New query).

-- =========================================================
-- Extensões
-- =========================================================
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- =========================================================
-- Tabelas
-- =========================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  is_admin boolean not null default false,
  permissions jsonb not null default '{"despesas": true, "recorrentes": true, "imprevistos": true, "metas": true, "historico": true}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.payment_capacity_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  percent numeric(5,2) not null check (percent >= 0 and percent <= 100),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  set_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.payment_capacity_history (profile_id, effective_to);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  kind text not null check (kind in ('recorrente', 'imprevisto', 'avulsa')),
  recurrence_day integer check (recurrence_day between 1 and 28),
  due_date date,
  status text not null default 'ativa' check (status in ('ativa', 'cancelada')),
  template_id uuid references public.expenses(id),
  year_month text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index expenses_template_month_unique
  on public.expenses (template_id, year_month)
  where template_id is not null;

create table public.expense_edits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  percent_used numeric(5,2) not null,
  amount_owed numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index on public.expense_splits (expense_id);
create index on public.expense_splits (profile_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  target_amount numeric(12,2) not null check (target_amount > 0),
  status text not null default 'ativa' check (status in ('ativa', 'concluida')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);
create index on public.goal_contributions (goal_id);

-- =========================================================
-- Helper: is_admin()
-- =========================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- =========================================================
-- Trigger: cria profile mínimo ao criar usuário no Auth
-- (a Edge Function de admin completa username/display_name/permissions depois)
-- =========================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, split_part(new.email, '@', 1), split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =========================================================
-- RPC: set_payment_capacities — admin define % de todos de uma vez (precisa somar 100)
-- =========================================================
create or replace function public.set_payment_capacities(p_capacities jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_item jsonb;
begin
  if not public.is_admin() then
    raise exception 'apenas admin pode definir capacidade de pagamento';
  end if;

  select sum((item->>'percent')::numeric) into v_total
  from jsonb_array_elements(p_capacities) as item;

  if v_total is null or abs(v_total - 100) > 0.01 then
    raise exception 'a soma das porcentagens precisa ser 100 (recebido: %)', v_total;
  end if;

  for v_item in select * from jsonb_array_elements(p_capacities)
  loop
    update public.payment_capacity_history
      set effective_to = now()
      where profile_id = (v_item->>'profile_id')::uuid
        and effective_to is null;

    insert into public.payment_capacity_history (profile_id, percent, set_by)
    values ((v_item->>'profile_id')::uuid, (v_item->>'percent')::numeric, auth.uid());
  end loop;
end;
$$;

-- =========================================================
-- RPC: create_expense — cria despesa e rateia pela capacidade vigente
-- =========================================================
create or replace function public.create_expense(
  p_description text,
  p_amount numeric,
  p_kind text,
  p_recurrence_day integer default null,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
begin
  insert into public.expenses (description, amount, kind, recurrence_day, due_date, created_by)
  values (p_description, p_amount, p_kind, p_recurrence_day, p_due_date, auth.uid())
  returning id into v_expense_id;

  insert into public.expense_splits (expense_id, profile_id, percent_used, amount_owed)
  select v_expense_id, h.profile_id, h.percent, round(p_amount * h.percent / 100, 2)
  from public.payment_capacity_history h
  join public.profiles p on p.id = h.profile_id
  where h.effective_to is null and p.active = true;

  return v_expense_id;
end;
$$;

-- =========================================================
-- RPC: update_expense — edita descrição/valor, loga histórico e re-rateia esta despesa
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

    delete from public.expense_splits where expense_id = p_expense_id;
    insert into public.expense_splits (expense_id, profile_id, percent_used, amount_owed)
    select p_expense_id, h.profile_id, h.percent, round(p_amount * h.percent / 100, 2)
    from public.payment_capacity_history h
    join public.profiles p on p.id = h.profile_id
    where h.effective_to is null and p.active = true;
  end if;

  update public.expenses set description = p_description, amount = p_amount where id = p_expense_id;
end;
$$;

-- =========================================================
-- RPC: cancel_expense — soft delete
-- =========================================================
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

  insert into public.expense_edits (expense_id, field, old_value, new_value, changed_by)
  values (p_expense_id, 'status', v_old.status, 'cancelada', auth.uid());

  update public.expenses set status = 'cancelada' where id = p_expense_id;
end;
$$;

-- =========================================================
-- RPC agendada: gera instâncias do mês para despesas recorrentes
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
begin
  for v_template in
    select * from public.expenses
    where kind = 'recorrente' and template_id is null and status = 'ativa'
  loop
    if not exists (
      select 1 from public.expenses
      where template_id = v_template.id and year_month = v_current_month
    ) then
      insert into public.expenses (description, amount, kind, due_date, template_id, year_month, created_by)
      values (
        v_template.description,
        v_template.amount,
        'recorrente',
        make_date(extract(year from now())::int, extract(month from now())::int, coalesce(v_template.recurrence_day, 1)),
        v_template.id,
        v_current_month,
        v_template.created_by
      )
      returning id into v_new_id;

      insert into public.expense_splits (expense_id, profile_id, percent_used, amount_owed)
      select v_new_id, h.profile_id, h.percent, round(v_template.amount * h.percent / 100, 2)
      from public.payment_capacity_history h
      join public.profiles p on p.id = h.profile_id
      where h.effective_to is null and p.active = true;
    end if;
  end loop;
end;
$$;

select cron.schedule(
  'generate-recurring-expenses',
  '0 3 1 * *',
  $$select public.generate_monthly_recurring_expenses();$$
);

-- =========================================================
-- RLS
-- =========================================================
alter table public.profiles enable row level security;
alter table public.payment_capacity_history enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_edits enable row level security;
alter table public.expense_splits enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_admin" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "capacity_select_authenticated" on public.payment_capacity_history
  for select to authenticated using (true);

create policy "expenses_select_authenticated" on public.expenses
  for select to authenticated using (true);

create policy "expense_edits_select_authenticated" on public.expense_edits
  for select to authenticated using (true);

create policy "expense_splits_select_authenticated" on public.expense_splits
  for select to authenticated using (true);

create policy "goals_select_authenticated" on public.goals
  for select to authenticated using (true);
create policy "goals_insert_authenticated" on public.goals
  for insert to authenticated with check (true);
create policy "goals_update_authenticated" on public.goals
  for update to authenticated using (true) with check (true);
create policy "goals_delete_admin" on public.goals
  for delete to authenticated using (public.is_admin());

create policy "goal_contributions_select_authenticated" on public.goal_contributions
  for select to authenticated using (true);
create policy "goal_contributions_insert_own" on public.goal_contributions
  for insert to authenticated with check (profile_id = auth.uid());
create policy "goal_contributions_delete_admin" on public.goal_contributions
  for delete to authenticated using (public.is_admin());

-- expenses/expense_splits/expense_edits/payment_capacity_history não têm policy de
-- INSERT/UPDATE/DELETE para o role authenticated: toda escrita passa pelas funções RPC
-- acima (SECURITY DEFINER), que fazem a checagem de permissão internamente.
