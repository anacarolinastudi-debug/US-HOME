import * as React from 'react'
import { computeBalances, fetchExpenses, fetchExpenseSplits, fetchProfiles } from '@/lib/data'
import type { BalanceEntry } from '@/lib/data'
import type { Profile } from '@/lib/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function BalancesPage() {
  const [balances, setBalances] = React.useState<BalanceEntry[]>([])
  const [profiles, setProfiles] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      const [expenses, allProfiles] = await Promise.all([fetchExpenses(), fetchProfiles()])
      const activeExpenses = expenses.filter(e => e.status === 'ativa' && e.paid_by)
      const splits = await fetchExpenseSplits(activeExpenses.map(e => e.id))
      setBalances(computeBalances(activeExpenses, splits))
      setProfiles(allProfiles)
      setLoading(false)
    }
    load()
  }, [])

  const name = (id: string) => profiles.find(p => p.id === id)?.display_name ?? '—'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Saldos</h1>
        <p className="text-sm text-muted-foreground">Quem deve quem, considerando todas as despesas ativas.</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : balances.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma dívida pendente — contas quitadas!
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {balances.map((b, i) => (
            <Card key={i}>
              <CardHeader className="space-y-0 pb-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{name(b.debtorId)}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span>{name(b.creditorId)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: 'var(--primary)' }}>{currency.format(b.amount)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
