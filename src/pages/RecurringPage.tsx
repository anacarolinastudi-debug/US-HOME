import * as React from 'react'
import { cancelExpense, createExpense, fetchRecurringTemplates } from '@/lib/data'
import type { Expense } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function RecurringPage() {
  const [templates, setTemplates] = React.useState<Expense[]>([])
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)
  const [description, setDescription] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [day, setDay] = React.useState('1')
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setTemplates(await fetchRecurringTemplates())
    setLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setDescription('')
    setAmount('')
    setDay('1')
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amountNum = Number(amount.replace(',', '.'))
    const dayNum = Number(day)
    if (!description.trim() || !amountNum || amountNum <= 0 || dayNum < 1 || dayNum > 28) {
      setError('Preencha descrição, valor válido e um dia entre 1 e 28.')
      return
    }
    try {
      await createExpense({
        description: description.trim(),
        amount: amountNum,
        kind: 'recorrente',
        recurrence_day: dayNum,
      })
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro ao salvar')
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Desativar esta despesa recorrente? Ela deixará de ser gerada nos próximos meses.')) return
    await cancelExpense(id)
    await load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Despesas recorrentes</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>Nova recorrente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova despesa recorrente</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="amount">Valor mensal (R$)</Label>
                <Input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="day">Dia do mês de vencimento</Label>
                <Input id="day" type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="submit">Salvar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-sm text-muted-foreground">
        Toda virada de mês, a despesa do mês é gerada automaticamente a partir destes modelos.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : templates.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma despesa recorrente cadastrada.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <Card key={t.id} className={t.status === 'cancelada' ? 'opacity-50' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{t.description}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {currency.format(t.amount)} · todo dia {t.recurrence_day}
                    {t.status === 'cancelada' ? ' · desativada' : ''}
                  </p>
                </div>
                {t.status === 'ativa' && (
                  <Button variant="destructive" size="sm" onClick={() => handleCancel(t.id)}>
                    Desativar
                  </Button>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
