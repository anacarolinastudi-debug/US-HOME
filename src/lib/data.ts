import { supabase } from '@/lib/supabase'
import type {
  Expense,
  ExpenseEdit,
  ExpenseSplit,
  Goal,
  GoalContribution,
  PaymentCapacityHistory,
  Profile,
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
  due_date?: string | null
}) {
  const { data, error } = await supabase.rpc('create_expense', {
    p_description: input.description,
    p_amount: input.amount,
    p_kind: input.kind,
    p_recurrence_day: input.recurrence_day ?? null,
    p_due_date: input.due_date ?? null,
  })
  if (error) throw error
  return data as string
}

export async function updateExpense(expenseId: string, description: string, amount: number) {
  const { error } = await supabase.rpc('update_expense', {
    p_expense_id: expenseId,
    p_description: description,
    p_amount: amount,
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
