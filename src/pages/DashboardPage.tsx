import * as React from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { fetchExpenses, fetchExpenseSplits } from '@/lib/data'
import type { Expense, ExpenseSplit } from '@/lib/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MonthTabs, buildMonthList, currentYearMonth, monthLabel } from '@/components/MonthTabs'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function expenseMonth(e: Expense) {
  return (e.due_date ?? e.created_at).slice(0, 7)
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [splits, setSplits] = React.useState<ExpenseSplit[]>([])
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedMonth, setSelectedMonth] = React.useState(currentYearMonth())

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      const allExpenses = await fetchExpenses()
      const visible = allExpenses.filter(e => e.status === 'ativa' && !(e.kind === 'recorrente' && e.template_id === null))
      setExpenses(visible)
      if (visible.length > 0) {
        const allSplits = await fetchExpenseSplits(visible.map(e => e.id))
        setSplits(allSplits.filter(s => s.profile_id === profile?.id))
      }
      setLoading(false)
    }
    if (profile) load()
  }, [profile])

  const expenseById = new Map(expenses.map(e => [e.id, e]))
  const mySplits = splits.filter(sp => {
    const exp = expenseById.get(sp.expense_id)
    return exp && expenseMonth(exp) === selectedMonth
  })
  const months = buildMonthList(splits.map(sp => expenseById.get(sp.expense_id)).filter((e): e is Expense => !!e).map(expenseMonth))
  const total = mySplits.reduce((s, sp) => s + sp.amount_owed, 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Olá, {profile?.display_name} 👋</h1>
        <p className="text-sm text-muted-foreground capitalize">{monthLabel(selectedMonth)}</p>
      </div>

      <MonthTabs months={months} value={selectedMonth} onChange={setSelectedMonth} />

      <Card style={{ borderColor: 'var(--primary)', borderWidth: '1.5px' }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Seu total no mês</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>{currency.format(total)}</p>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : mySplits.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma despesa para você neste mês.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalhamento</h2>
          {mySplits.map(sp => {
            const exp = expenseById.get(sp.expense_id)
            return (
              <div key={sp.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
                <p className="text-sm font-medium">{exp?.description ?? '—'}</p>
                <p className="text-sm font-semibold">{currency.format(sp.amount_owed)}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
