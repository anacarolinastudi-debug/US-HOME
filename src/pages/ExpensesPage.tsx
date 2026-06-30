import * as React from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import {
  cancelExpense,
  createExpense,
  fetchExpenseSplits,
  fetchExpenses,
  fetchProfiles,
  updateExpense,
} from '@/lib/data'
import type { Expense, ExpenseSplit, Profile } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function ExpensesPage({ mode }: { mode: 'all' | 'imprevistos' }) {
  const { profile } = useAuth()
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [splits, setSplits] = React.useState<ExpenseSplit[]>([])
  const [profiles, setProfiles] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Expense | null>(null)
  const [description, setDescription] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const [allExpenses, allProfiles] = await Promise.all([
      fetchExpenses(mode === 'imprevistos' ? ['imprevisto'] : undefined),
      fetchProfiles(),
    ])
    const visible =
      mode === 'imprevistos'
        ? allExpenses
        : allExpenses.filter((e) => !(e.kind === 'recorrente' && e.template_id === null))
    setExpenses(visible)
    setProfiles(allProfiles)
    setSplits(await fetchExpenseSplits(visible.map((e) => e.id)))
    setLoading(false)
  }, [mode])

  React.useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setDescription('')
    setAmount('')
    setError(null)
    setOpen(true)
  }

  function openEdit(expense: Expense) {
    setEditing(expense)
    setDescription(expense.description)
    setAmount(String(expense.amount))
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amountNum = Number(amount.replace(',', '.'))
    if (!description.trim() || !amountNum || amountNum <= 0) {
      setError('Preencha descrição e um valor válido.')
      return
    }
    try {
      if (editing) {
        await updateExpense(editing.id, description.trim(), amountNum)
      } else {
        await createExpense({
          description: description.trim(),
          amount: amountNum,
          kind: mode === 'imprevistos' ? 'imprevisto' : 'avulsa',
        })
      }
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro ao salvar')
    }
  }

  async function handleCancel(expenseId: string) {
    if (!confirm('Excluir esta despesa?')) return
    await cancelExpense(expenseId)
    await load()
  }

  const profileName = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? '—'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{mode === 'imprevistos' ? 'Imprevistos' : 'Despesas'}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>Nova despesa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar despesa' : 'Nova despesa'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="amount">Valor (R$)</Label>
                <Input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="submit">Salvar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : expenses.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma despesa lançada ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {expenses.map((expense) => {
            const expenseSplits = splits.filter((s) => s.expense_id === expense.id)
            const canEdit = profile?.is_admin || profile?.id === expense.created_by
            return (
              <Card key={expense.id} className={expense.status === 'cancelada' ? 'opacity-50' : ''}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="text-base">{expense.description}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {currency.format(expense.amount)} · {expense.kind}
                      {expense.status === 'cancelada' ? ' · cancelada' : ''}
                    </p>
                  </div>
                  {canEdit && expense.status === 'ativa' && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(expense)}>
                        Editar
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleCancel(expense.id)}>
                        Excluir
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="mb-1 text-sm font-medium">Rateio:</p>
                  <ul className="text-sm text-muted-foreground">
                    {expenseSplits.map((s) => (
                      <li key={s.id}>
                        {profileName(s.profile_id)}: {currency.format(s.amount_owed)} ({s.percent_used}%)
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
