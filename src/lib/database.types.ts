export type ExpenseKind = 'recorrente' | 'imprevisto' | 'avulsa'
export type ExpenseStatus = 'ativa' | 'cancelada'
export type PaymentStatus = 'pendente' | 'paga'
export type GoalStatus = 'ativa' | 'concluida'
export type SplitMethod = 'capacidade' | 'igual' | 'manual'

export interface TabPermissions {
  despesas: boolean
  imprevistos: boolean
  metas: boolean
  saldos: boolean
}

export interface Profile {
  id: string
  username: string
  display_name: string
  is_admin: boolean
  permissions: TabPermissions
  active: boolean
  created_at: string
}

export interface PaymentCapacityHistory {
  id: string
  profile_id: string
  percent: number
  effective_from: string
  effective_to: string | null
  set_by: string | null
  created_at: string
}

export interface Expense {
  id: string
  description: string
  amount: number
  kind: ExpenseKind
  recurrence_day: number | null
  due_date: string | null
  status: ExpenseStatus
  template_id: string | null
  year_month: string | null
  paid_by: string | null
  payment_status: PaymentStatus
  paid_at: string | null
  recurrence_start_date: string | null
  recurrence_end_date: string | null
  split_method: SplitMethod | null
  created_by: string | null
  created_at: string
}

export interface BalanceSettlement {
  id: string
  year_month: string
  debtor_id: string
  creditor_id: string
  amount: number
  settled_by: string | null
  settled_at: string
  note: string | null
}

export interface ExpenseEdit {
  id: string
  expense_id: string
  field: string
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_at: string
}

export interface ExpenseSplit {
  id: string
  expense_id: string
  profile_id: string
  percent_used: number
  amount_owed: number
  created_at: string
}

export interface Goal {
  id: string
  name: string
  description: string | null
  target_amount: number
  status: GoalStatus
  created_by: string | null
  created_at: string
}

export interface GoalContribution {
  id: string
  goal_id: string
  profile_id: string
  amount: number
  note: string | null
  created_at: string
}
