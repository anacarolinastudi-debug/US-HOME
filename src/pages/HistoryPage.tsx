import * as React from 'react'
import { fetchCapacityHistory, fetchExpenseEdits, fetchExpenses, fetchProfiles } from '@/lib/data'
import type { Expense, ExpenseEdit, PaymentCapacityHistory, Profile } from '@/lib/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type TimelineItem =
  | { type: 'expense_edit'; date: string; data: ExpenseEdit }
  | { type: 'capacity_change'; date: string; data: PaymentCapacityHistory }

export function HistoryPage() {
  const [items, setItems] = React.useState<TimelineItem[]>([])
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [profiles, setProfiles] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      const [edits, capacity, allExpenses, allProfiles] = await Promise.all([
        fetchExpenseEdits(),
        fetchCapacityHistory(),
        fetchExpenses(),
        fetchProfiles(),
      ])
      setExpenses(allExpenses)
      setProfiles(allProfiles)
      const merged: TimelineItem[] = [
        ...edits.map((e): TimelineItem => ({ type: 'expense_edit', date: e.changed_at, data: e })),
        ...capacity.map((c): TimelineItem => ({ type: 'capacity_change', date: c.created_at, data: c })),
      ].sort((a, b) => b.date.localeCompare(a.date))
      setItems(merged)
      setLoading(false)
    }
    load()
  }, [])

  const expenseDesc = (id: string) => expenses.find((e) => e.id === id)?.description ?? 'despesa removida'
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? '—'

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Histórico</h1>
      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma alteração registrada ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Card key={`${item.type}-${item.data.id}`}>
              <CardHeader className="space-y-0 pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {new Date(item.date).toLocaleString('pt-BR')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm">
                {item.type === 'expense_edit' ? (
                  <p>
                    Despesa <strong>{expenseDesc(item.data.expense_id)}</strong>: campo{' '}
                    <strong>{item.data.field}</strong> alterado de "{item.data.old_value}" para "
                    {item.data.new_value}".
                  </p>
                ) : (
                  <p>
                    Capacidade de pagamento de <strong>{profileName(item.data.profile_id)}</strong> definida para{' '}
                    <strong>{item.data.percent}%</strong>
                    {item.data.effective_to ? ` (vigente até ${new Date(item.data.effective_to).toLocaleDateString('pt-BR')})` : ' (vigente)'}.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
