import * as React from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import {
  cancelExpense, createExpense, fetchExpenseSplits, fetchExpenses,
  fetchProfiles, fetchRecurringTemplates, updateExpense,
} from '@/lib/data'
import type { Expense, ExpenseSplit, Profile, SplitMethod } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { MonthTabs, buildMonthList, currentYearMonth } from '@/components/MonthTabs'
import { RefreshCw } from 'lucide-react'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function expenseMonth(e: Expense) {
  return (e.due_date ?? e.created_at).slice(0, 7)
}

interface FormProps {
  mode: 'all' | 'imprevistos'
  profiles: Profile[]
  myId: string
  editing: Expense | null
  onSaved: () => void
  onClose: () => void
}

function ExpenseForm({ mode, profiles, myId, editing, onSaved, onClose }: FormProps) {
  const [description, setDescription] = React.useState(editing?.description ?? '')
  const [amount, setAmount] = React.useState(editing ? String(editing.amount) : '')
  const [dueDate, setDueDate] = React.useState(editing?.due_date ?? new Date().toISOString().slice(0, 10))
  const [isRecurring, setIsRecurring] = React.useState(false)
  const [recurrenceDay, setRecurrenceDay] = React.useState('1')
  const [paidBy, setPaidBy] = React.useState(myId)
  const activeProfiles = profiles.filter(p => p.active)
  const [participants, setParticipants] = React.useState<Set<string>>(new Set(activeProfiles.map(p => p.id)))
  const [splitMethod, setSplitMethod] = React.useState<SplitMethod>('capacidade')
  const [manualAmounts, setManualAmounts] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)

  const amountNum = Number(amount.replace(',', '.'))
  const selectedProfiles = activeProfiles.filter(p => participants.has(p.id))
  const manualSum = selectedProfiles.reduce((s, p) => s + (Number(manualAmounts[p.id]?.replace(',', '.')) || 0), 0)
  const manualRemaining = Math.round((amountNum - manualSum) * 100) / 100

  function toggleParticipant(id: string) {
    setParticipants(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!description.trim() || !amountNum || amountNum <= 0) { setError('Preencha descrição e valor válido.'); return }
    if (!editing && participants.size === 0) { setError('Selecione ao menos um participante.'); return }
    try {
      if (editing) {
        await updateExpense(editing.id, description.trim(), amountNum)
      } else {
        await createExpense({
          description: description.trim(),
          amount: amountNum,
          kind: mode === 'imprevistos' ? 'imprevisto' : isRecurring ? 'recorrente' : 'avulsa',
          recurrence_day: isRecurring ? Number(recurrenceDay) : null,
          due_date: isRecurring ? null : dueDate,
          paid_by: paidBy,
          participant_ids: selectedProfiles.map(p => p.id),
          split_method: splitMethod,
          manual_amounts: splitMethod === 'manual'
            ? selectedProfiles.map(p => ({ profile_id: p.id, amount: Number(manualAmounts[p.id]?.replace(',', '.')) || 0 }))
            : null,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro ao salvar')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="desc">Descrição</Label>
        <Input id="desc" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="amt">Valor (R$)</Label>
        <Input id="amt" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" />
      </div>

      {mode === 'all' && !editing && (
        <div className="flex items-center gap-2">
          <Checkbox id="recurring" checked={isRecurring} onCheckedChange={v => setIsRecurring(!!v)} />
          <Label htmlFor="recurring">Despesa recorrente (todo mês)</Label>
        </div>
      )}
      {isRecurring && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="rday">Dia do mês de vencimento</Label>
          <Input id="rday" type="number" min={1} max={31} value={recurrenceDay} onChange={e => setRecurrenceDay(e.target.value)} className="w-24" />
          <p className="text-xs text-muted-foreground">Em meses mais curtos (ex: fevereiro), usa o último dia do mês.</p>
        </div>
      )}
      {!isRecurring && !editing && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="dueDate">Data de pagamento</Label>
          <Input id="dueDate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-44" />
        </div>
      )}

      {!editing && <>
        <div className="flex flex-col gap-2">
          <Label>Quem pagou</Label>
          <Select value={paidBy} onValueChange={setPaidBy}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {activeProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Quem participa</Label>
          <div className="space-y-1.5 rounded-md border p-3">
            {activeProfiles.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <Checkbox id={`pp-${p.id}`} checked={participants.has(p.id)} onCheckedChange={() => toggleParticipant(p.id)} />
                <Label htmlFor={`pp-${p.id}`}>{p.display_name}</Label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Forma de divisão</Label>
          <Select value={splitMethod} onValueChange={v => setSplitMethod(v as SplitMethod)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="capacidade">Proporcional à capacidade</SelectItem>
              <SelectItem value="igual">Partes iguais</SelectItem>
              <SelectItem value="manual">Valores personalizados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {splitMethod === 'manual' && selectedProfiles.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Total: {currency.format(amountNum || 0)}</p>
            {selectedProfiles.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                <Label className="w-32 text-sm">{p.display_name}</Label>
                <Input value={manualAmounts[p.id] ?? ''} onChange={e => setManualAmounts(prev => ({ ...prev, [p.id]: e.target.value }))} inputMode="decimal" className="w-28" placeholder="0,00" />
              </div>
            ))}
            <p className={`text-xs ${Math.abs(manualRemaining) > 0.01 ? 'text-destructive' : 'text-muted-foreground'}`}>
              Restante: {currency.format(manualRemaining)}
            </p>
          </div>
        )}
      </>}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
    </form>
  )
}

export function ExpensesPage({ mode }: { mode: 'all' | 'imprevistos' }) {
  const { profile } = useAuth()
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [templates, setTemplates] = React.useState<Expense[]>([])
  const [splits, setSplits] = React.useState<ExpenseSplit[]>([])
  const [profiles, setProfiles] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Expense | null>(null)
  const [selectedMonth, setSelectedMonth] = React.useState(currentYearMonth())

  const load = React.useCallback(async () => {
    setLoading(true)
    const [allExpenses, allProfiles, tpls] = await Promise.all([
      fetchExpenses(mode === 'imprevistos' ? ['imprevisto'] : undefined),
      fetchProfiles(),
      mode === 'all' ? fetchRecurringTemplates() : Promise.resolve([]),
    ])
    const visible = mode === 'imprevistos'
      ? allExpenses
      : allExpenses.filter(e => !(e.kind === 'recorrente' && e.template_id === null))
    setExpenses(visible)
    setTemplates(tpls)
    setProfiles(allProfiles)
    setSplits(await fetchExpenseSplits([...visible, ...tpls].map(e => e.id)))
    setLoading(false)
  }, [mode])

  React.useEffect(() => { load() }, [load])

  const profileName = (id: string) => profiles.find(p => p.id === id)?.display_name ?? '—'
  const months = buildMonthList(expenses.map(expenseMonth))
  const monthExpenses = expenses.filter(e => expenseMonth(e) === selectedMonth)

  async function handleCancel(id: string) {
    if (!confirm('Excluir esta despesa?')) return
    await cancelExpense(id)
    await load()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{mode === 'imprevistos' ? 'Imprevistos' : 'Despesas'}</h1>
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null) }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setOpen(true) }}>Nova despesa</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar despesa' : 'Nova despesa'}</DialogTitle>
            </DialogHeader>
            <ExpenseForm mode={mode} profiles={profiles} myId={profile?.id ?? ''} editing={editing} onSaved={load} onClose={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {mode === 'all' && templates.filter(t => t.status === 'ativa').length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <RefreshCw className="h-3 w-3" /> Recorrentes ativas
          </p>
          {templates.filter(t => t.status === 'ativa').map(t => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">{t.description}</p>
                <p className="text-xs text-muted-foreground">{currency.format(t.amount)} · dia {t.recurrence_day ?? 1}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleCancel(t.id)}>Desativar</Button>
            </div>
          ))}
        </div>
      )}

      <MonthTabs months={months} value={selectedMonth} onChange={setSelectedMonth} />

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : monthExpenses.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma despesa neste mês.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {monthExpenses.map(expense => {
            const expSplits = splits.filter(s => s.expense_id === expense.id)
            const canEdit = profile?.is_admin || profile?.id === expense.created_by
            return (
              <Card key={expense.id} className={expense.status === 'cancelada' ? 'opacity-50' : ''}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{expense.description}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {currency.format(expense.amount)}
                      {expense.kind !== 'avulsa' && ` · ${expense.kind}`}
                      {expense.due_date && ` · vence ${new Date(expense.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                      {expense.paid_by && expense.paid_by !== expense.created_by && ` · pago por ${profileName(expense.paid_by)}`}
                      {expense.status === 'cancelada' && ' · cancelada'}
                    </p>
                  </div>
                  {canEdit && expense.status === 'ativa' && (
                    <div className="flex flex-shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditing(expense); setOpen(true) }}>Editar</Button>
                      <Button variant="destructive" size="sm" onClick={() => handleCancel(expense.id)}>Excluir</Button>
                    </div>
                  )}
                </CardHeader>
                {expSplits.length > 0 && (
                  <CardContent className="pt-0">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Rateio</p>
                    <ul className="space-y-0.5 text-sm text-muted-foreground">
                      {expSplits.map(s => (
                        <li key={s.id}>{profileName(s.profile_id)}: {currency.format(s.amount_owed)} ({s.percent_used}%)</li>
                      ))}
                    </ul>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
