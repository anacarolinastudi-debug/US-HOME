import * as React from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { fetchExpenses, fetchExpenseSplits } from '@/lib/data'
import type { Expense, ExpenseSplit } from '@/lib/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [splits, setSplits] = React.useState<ExpenseSplit[]>([])
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [loading, setLoading] = React.useState(true)

  const ym = currentYearMonth()

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      const allExpenses = await fetchExpenses()
      const monthExpenses = allExpenses.filter(e => {
        if (e.status === 'cancelada') return false
        const d = (e.due_date ?? e.created_at).slice(0, 7)
        return d === ym && !(e.kind === 'recorrente' && e.template_id === null)
      })
      setExpenses(monthExpenses)
      if (monthExpenses.length > 0) {
        const allSplits = await fetchExpenseSplits(monthExpenses.map(e => e.id))
        setSplits(allSplits.filter(s => s.profile_id === profile?.id))
      }
      setLoading(false)
    }
    if (profile) load()
  }, [profile, ym])

  const monthLabel = new Date(ym + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const total = splits.reduce((s, sp) => s + sp.amount_owed, 0)

  const expenseById = new Map(expenses.map(e => [e.id, e]))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Olá, {profile?.display_name} 👋</h1>
        <p className="text-sm text-muted-foreground capitalize">{monthLabel}</p>
      </div>

      <Card style={{ borderColor: 'var(--primary)', borderWidth: '1.5px' }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Seu total este mês</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>{currency.format(total)}</p>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : splits.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma despesa para você este mês ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Detalhamento</h2>
          {splits.map(sp => {
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
