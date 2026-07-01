import { supabase } from '@/lib/supabase'
import type {
  BalanceSettlement,
  Expense,
  ExpenseEdit,
  ExpenseSplit,
  Goal,
  GoalContribution,
  PaymentCapacityHistory,
  Profile,
  SplitMethod,
} from '@/lib/database.types'

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('display_name')
  if (error) throw error
  return data as Profile[]
}

export async function fetchActiveCapacities(): Promise<PaymentCapacityHistory[]> {
  const { data, error } = await supabase
    .from('payment_capacity_history')
    .select('*')
    .is('effective_to', null)
  if (error) throw error
  return data as PaymentCapacityHistory[]
}

export async function fetchCapacityHistory(): Promise<PaymentCapacityHistory[]> {
  const { data, error } = await supabase
    .from('payment_capacity_history')
    .select('*')
    .order('effective_from', { ascending: false })
  if (error) throw error
  return data as PaymentCapacityHistory[]
}

export async function setPaymentCapacities(capacities: { profile_id: string; percent: number }[]) {
  const { error } = await supabase.rpc('set_payment_capacities', { p_capacities: capacities })
  if (error) throw error
}

export async function fetchExpenses(kinds?: Expense['kind'][]): Promise<Expense[]> {
  let query = supabase.from('expenses').select('*').order('created_at', { ascending: false })
  if (kinds) query = query.in('kind', kinds)
  const { data, error } = await query
  if (error) throw error
  return data as Expense[]
}

export async function fetchRecurringTemplates(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('kind', 'recorrente')
    .is('template_id', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Expense[]
}

export async function fetchExpenseSplits(expenseIds: string[]): Promise<ExpenseSplit[]> {
  if (expenseIds.length === 0) return []
  const { data, error } = await supabase.from('expense_splits').select('*').in('expense_id', expenseIds)
  if (error) throw error
  return data as ExpenseSplit[]
}

export async function fetchExpenseEdits(): Promise<ExpenseEdit[]> {
  const { data, error } = await supabase
    .from('expense_edits')
    .select('*')
    .order('changed_at', { ascending: false })
  if (error) throw error
  return data as ExpenseEdit[]
}

export async function createExpense(input: {
  description: string
  amount: number
  kind: Expense['kind']
  recurrence_day?: number | null
  recurrence_start_date?: string | null
  recurrence_end_date?: string | null
  due_date?: string | null
  paid_by?: string | null
  participant_ids?: string[] | null
  split_method?: SplitMethod
  manual_amounts?: { profile_id: string; amount: number }[] | null
}) {
  const { data, error } = await supabase.rpc('create_expense', {
    p_description: input.description,
    p_amount: input.amount,
    p_kind: input.kind,
    p_recurrence_day: input.recurrence_day ?? null,
    p_recurrence_start_date: input.recurrence_start_date ?? null,
    p_recurrence_end_date: input.recurrence_end_date ?? null,
    p_due_date: input.due_date ?? null,
    p_paid_by: input.paid_by ?? null,
    p_participant_ids: input.participant_ids ?? null,
    p_split_method: input.split_method ?? 'capacidade',
    p_manual_amounts: input.manual_amounts ? input.manual_amounts : null,
  })
  if (error) throw error
  return data as string
}

export async function completeSignupProfile(username: string, displayName: string) {
  const { error } = await supabase.rpc('complete_signup_profile', {
    p_username: username,
    p_display_name: displayName,
  })
  if (error) throw error
}

export interface BalanceEntry {
  debtorId: string
  creditorId: string
  amount: number
  items: BalanceItem[]
}

export interface BalanceItem {
  expenseId: string
  description: string
  date: string
  paidBy: string
  owedBy: string
  amount: number
}

export function computeBalances(
  expenses: Expense[],
  splits: ExpenseSplit[],
): BalanceEntry[] {
  const net = new Map<string, number>()

  for (const expense of expenses) {
    if (expense.status !== 'ativa' || !expense.paid_by) continue
    if (expense.payment_status !== 'paga') continue
    const expenseSplits = splits.filter((s) => s.expense_id === expense.id)
    for (const split of expenseSplits) {
      if (split.profile_id === expense.paid_by) continue
      const key = [split.profile_id, expense.paid_by].sort().join('|')
      const dir = split.profile_id < expense.paid_by ? 1 : -1
      net.set(key, (net.get(key) ?? 0) + split.amount_owed * dir)
    }
  }

  const results: BalanceEntry[] = []
  for (const [key, amount] of net.entries()) {
    if (Math.abs(amount) < 0.01) continue
    const [a, b] = key.split('|')
    results.push(
      amount > 0
        ? { debtorId: a, creditorId: b, amount: Math.abs(amount), items: [] }
        : { debtorId: b, creditorId: a, amount: Math.abs(amount), items: [] },
    )
  }
  return results
}

export function computeBalanceDetails(
  expenses: Expense[],
  splits: ExpenseSplit[],
): BalanceEntry[] {
  const entries = new Map<string, BalanceEntry>()

  for (const expense of expenses) {
    if (expense.status !== 'ativa' || expense.payment_status !== 'paga' || !expense.paid_by) continue
    const expenseSplits = splits.filter((s) => s.expense_id === expense.id)
    for (const split of expenseSplits) {
      if (split.profile_id === expense.paid_by) continue
      const key = `${split.profile_id}|${expense.paid_by}`
      const current = entries.get(key) ?? {
        debtorId: split.profile_id,
        creditorId: expense.paid_by,
        amount: 0,
        items: [],
      }
      current.amount += split.amount_owed
      current.items.push({
        expenseId: expense.id,
        description: expense.description,
        date: expense.due_date ?? expense.created_at,
        paidBy: expense.paid_by,
        owedBy: split.profile_id,
        amount: split.amount_owed,
      })
      entries.set(key, current)
    }
  }

  return [...entries.values()].filter((entry) => entry.amount >= 0.01)
}

export async function updateExpense(input: {
  expenseId: string
  description: string
  amount: number
  recurrence_day?: number | null
  recurrence_start_date?: string | null
  recurrence_end_date?: string | null
}) {
  const { error } = await supabase.rpc('update_expense', {
    p_expense_id: input.expenseId,
    p_description: input.description,
    p_amount: input.amount,
    p_recurrence_day: input.recurrence_day ?? null,
    p_recurrence_start_date: input.recurrence_start_date ?? null,
    p_recurrence_end_date: input.recurrence_end_date ?? null,
  })
  if (error) throw error
}

export async function markExpensePaid(expenseId: string, paidBy: string) {
  const { error } = await supabase.rpc('mark_expense_paid', {
    p_expense_id: expenseId,
    p_paid_by: paidBy,
  })
  if (error) throw error
}

export async function fetchBalanceSettlements(yearMonth?: string): Promise<BalanceSettlement[]> {
  let query = supabase.from('balance_settlements').select('*').order('settled_at', { ascending: false })
  if (yearMonth) query = query.eq('year_month', yearMonth)
  const { data, error } = await query
  if (error) throw error
  return data as BalanceSettlement[]
}

export async function settleBalance(input: {
  year_month: string
  debtor_id: string
  creditor_id: string
  amount: number
}) {
  const { error } = await supabase.rpc('settle_balance', {
    p_year_month: input.year_month,
    p_debtor_id: input.debtor_id,
    p_creditor_id: input.creditor_id,
    p_amount: input.amount,
  })
  if (error) throw error
}

export async function cancelExpense(expenseId: string) {
  const { error } = await supabase.rpc('cancel_expense', { p_expense_id: expenseId })
  if (error) throw error
}

export async function fetchGoals(): Promise<Goal[]> {
  const { data, error } = await supabase.from('goals').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as Goal[]
}

export async function createGoal(input: { name: string; description?: string; target_amount: number }) {
  const { error } = await supabase.from('goals').insert(input)
  if (error) throw error
}

export async function updateGoalStatus(goalId: string, status: Goal['status']) {
  const { error } = await supabase.from('goals').update({ status }).eq('id', goalId)
  if (error) throw error
}

export async function fetchGoalContributions(goalIds: string[]): Promise<GoalContribution[]> {
  if (goalIds.length === 0) return []
  const { data, error } = await supabase
    .from('goal_contributions')
    .select('*')
    .in('goal_id', goalIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as GoalContribution[]
}

export async function addGoalContribution(input: {
  goal_id: string
  profile_id: string
  amount: number
  note?: string
}) {
  const { error } = await supabase.from('goal_contributions').insert(input)
  if (error) throw error
}
