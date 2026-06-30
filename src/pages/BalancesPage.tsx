import * as React from 'react'
import {
  computeBalanceDetails,
  fetchBalanceSettlements,
  fetchExpenses,
  fetchExpenseSplits,
  fetchProfiles,
  settleBalance,
} from '@/lib/data'
import type { BalanceEntry } from '@/lib/data'
import type { BalanceSettlement, Expense, Profile } from '@/lib/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { MonthTabs, buildMonthList, currentYearMonth } from '@/components/MonthTabs'
import { ArrowRight } from 'lucide-react'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function expenseMonth(expense: Expense) {
  return (expense.due_date ?? expense.created_at).slice(0, 7)
}

function settlementKey(yearMonth: string, debtorId: string, creditorId: string) {
  return `${yearMonth}|${debtorId}|${creditorId}`
}

export function BalancesPage() {
  const [balances, setBalances] = React.useState<BalanceEntry[]>([])
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [settlements, setSettlements] = React.useState<BalanceSettlement[]>([])
  const [profiles, setProfiles] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedMonth, setSelectedMonth] = React.useState(currentYearMonth())

  const load = React.useCallback(async () => {
    setLoading(true)
    const [allExpenses, allProfiles, allSettlements] = await Promise.all([
      fetchExpenses(),
      fetchProfiles(),
      fetchBalanceSettlements(),
    ])
    const paidExpenses = allExpenses.filter(e => e.status === 'ativa' && e.payment_status === 'paga' && e.paid_by)
    const splits = await fetchExpenseSplits(paidExpenses.map(e => e.id))
    setExpenses(paidExpenses)
    setBalances(computeBalanceDetails(paidExpenses, splits))
    setProfiles(allProfiles)
    setSettlements(allSettlements)
    setLoading(false)
  }, [])

  React.useEffect(() => { load() }, [load])

  const name = (id: string) => profiles.find(p => p.id === id)?.display_name ?? '—'
  const months = buildMonthList(expenses.map(expenseMonth))
  const settledKeys = new Set(settlements.map(s => settlementKey(s.year_month, s.debtor_id, s.creditor_id)))
  const monthBalances = balances
    .map(balance => ({
      ...balance,
      items: balance.items.filter(item => item.date.slice(0, 7) === selectedMonth),
    }))
    .map(balance => ({ ...balance, amount: balance.items.reduce((sum, item) => sum + item.amount, 0) }))
    .filter(balance => balance.amount >= 0.01)
  const total = monthBalances.reduce((sum, balance) => (
    settledKeys.has(settlementKey(selectedMonth, balance.debtorId, balance.creditorId))
      ? sum
      : sum + balance.amount
  ), 0)

  async function handleSettle(balance: BalanceEntry) {
    await settleBalance({
      year_month: selectedMonth,
      debtor_id: balance.debtorId,
      creditor_id: balance.creditorId,
      amount: balance.amount,
    })
    await load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Saldos</h1>
        <p className="text-sm text-muted-foreground">Quem deve quem, separado por mês e considerando despesas pagas.</p>
      </div>

      <MonthTabs months={months} value={selectedMonth} onChange={setSelectedMonth} />

      <Card style={{ borderColor: 'var(--primary)', borderWidth: '1.5px' }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total do mês</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>{currency.format(total)}</p>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : monthBalances.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma dívida pendente neste mês.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {monthBalances.map((balance) => {
            const isSettled = settledKeys.has(settlementKey(selectedMonth, balance.debtorId, balance.creditorId))
            return (
              <Card key={`${balance.debtorId}-${balance.creditorId}`} className={isSettled ? 'opacity-60' : ''}>
                <CardHeader className="space-y-0 pb-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span>{name(balance.debtorId)}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span>{name(balance.creditorId)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>{currency.format(balance.amount)}</p>
                      <p className="text-xs text-muted-foreground">{isSettled ? 'Quitado' : 'Pendente'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">Detalhes</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Composição do saldo</DialogTitle>
                          </DialogHeader>
                          <div className="flex flex-col gap-2">
                            {balance.items.map(item => (
                              <div key={`${item.expenseId}-${item.owedBy}`} className="rounded-md border p-3">
                                <p className="text-sm font-medium">{item.description}</p>
                                <p className="text-sm text-muted-foreground">
                                  Pago por {name(item.paidBy)} · {currency.format(item.amount)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                      {!isSettled && (
                        <Button size="sm" onClick={() => handleSettle(balance)}>Marcar quitado</Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
