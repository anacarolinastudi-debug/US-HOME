import * as React from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { fetchExpenses, fetchExpenseSplits, fetchProfiles, fetchRecurringTemplates } from '@/lib/data'
import type { Expense, ExpenseSplit, Profile } from '@/lib/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MonthTabs, buildMonthList, currentYearMonth, monthLabel, nextYearMonth } from '@/components/MonthTabs'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function expenseMonth(e: Expense) {
  return (e.due_date ?? e.created_at).slice(0, 7)
}

function projectedRecurringDate(template: Expense, yearMonth: string) {
  return `${yearMonth}-${String(template.recurrence_day ?? 1).padStart(2, '0')}`
}

function projectedRecurringExpense(template: Expense, yearMonth: string): Expense {
  return {
    ...template,
    id: `preview-${template.id}-${yearMonth}`,
    due_date: projectedRecurringDate(template, yearMonth),
    template_id: template.id,
    year_month: yearMonth,
  }
}

function MonthCalendar({ yearMonth, expenses }: { yearMonth: string; expenses: Expense[] }) {
  const [year, month] = yearMonth.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const byDay = new Map<number, Expense[]>()
  for (const e of expenses) {
    if (!e.due_date) continue
    const day = Number(e.due_date.slice(8, 10))
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(e)
  }

  const cells: (number | null)[] = [
    ...Array(firstDay === 0 ? 6 : firstDay - 1).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const todayDay = today.getDate()

  const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map(d => (
          <div key={d} className="py-1 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dayExpenses = byDay.get(day) ?? []
          const isToday = isCurrentMonth && day === todayDay
          const hasDue = dayExpenses.length > 0
          return (
            <div
              key={i}
              title={dayExpenses.map(e => `${e.description}: ${currency.format(e.amount)}`).join('\n')}
              className="relative flex flex-col items-center rounded-md py-1.5 text-xs"
              style={{
                background: hasDue ? 'var(--accent)' : undefined,
                border: isToday ? '1.5px solid var(--primary)' : '1.5px solid transparent',
              }}
            >
              <span className="font-medium" style={{ color: isToday ? 'var(--primary)' : undefined }}>{day}</span>
              {hasDue && (
                <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                  {dayExpenses.slice(0, 3).map((e, j) => (
                    <span
                      key={j}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: 'var(--primary)' }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]).map(([day, exps]) => (
        <div key={day} className="mt-1 flex flex-col gap-0.5">
          {exps.map(e => (
            <div key={e.id} className="flex items-center justify-between rounded-md px-2 py-1 text-xs" style={{ background: 'var(--accent)' }}>
              <span className="font-medium">Dia {day} · {e.description}</span>
              <span style={{ color: 'var(--primary)' }}>{currency.format(e.amount)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [splits, setSplits] = React.useState<ExpenseSplit[]>([])
  const [allSplitsMap, setAllSplitsMap] = React.useState<Map<string, ExpenseSplit[]>>(new Map())
  const [expenses, setExpenses] = React.useState<Expense[]>([])
  const [profiles, setProfiles] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedMonth, setSelectedMonth] = React.useState(currentYearMonth())

  React.useEffect(() => {
    async function load() {
      setLoading(true)
      const [allExpenses, templates, allProfiles] = await Promise.all([
        fetchExpenses(), fetchRecurringTemplates(), fetchProfiles(),
      ])
      const visible = allExpenses.filter(e => e.status === 'ativa' && !(e.kind === 'recorrente' && e.template_id === null))
      const futureMonths = [nextYearMonth(), nextYearMonth(nextYearMonth())]
      const previewExpenses = futureMonths.flatMap(month =>
        templates
          .filter(t => t.status === 'ativa')
          .filter(t => !t.recurrence_start_date || t.recurrence_start_date.slice(0, 7) <= month)
          .filter(t => !t.recurrence_end_date || t.recurrence_end_date.slice(0, 7) >= month)
          .filter(t => !visible.some(e => e.template_id === t.id && e.year_month === month))
          .map(t => projectedRecurringExpense(t, month))
      )
      const displayExpenses = [...visible, ...previewExpenses]
      setExpenses(displayExpenses)
      setProfiles(allProfiles)

      if (displayExpenses.length > 0) {
        const rawSplits = await fetchExpenseSplits([...visible, ...templates].map(e => e.id))
        const previewSplits = previewExpenses.flatMap(preview =>
          rawSplits
            .filter(s => s.expense_id === preview.template_id)
            .map(s => ({ ...s, id: `preview-${s.id}-${preview.year_month}`, expense_id: preview.id })),
        )
        const displaySplits = [...rawSplits, ...previewSplits]

        // splits do usuário atual
        setSplits(displaySplits.filter(s => s.profile_id === profile?.id))

        // mapa de todos os splits por expense_id
        const map = new Map<string, ExpenseSplit[]>()
        for (const s of displaySplits) {
          if (!map.has(s.expense_id)) map.set(s.expense_id, [])
          map.get(s.expense_id)!.push(s)
        }
        setAllSplitsMap(map)
      }
      setLoading(false)
    }
    if (profile) load()
  }, [profile])

  const expenseById = new Map(expenses.map(e => [e.id, e]))
  const monthExpenses = expenses.filter(e => expenseMonth(e) === selectedMonth)
  const mySplits = splits.filter(sp => expenseById.get(sp.expense_id) && expenseMonth(expenseById.get(sp.expense_id)!) === selectedMonth)
  const months = buildMonthList(expenses.map(expenseMonth))
  const myTotal = mySplits.reduce((s, sp) => s + sp.amount_owed, 0)
  const grandTotal = monthExpenses.reduce((s, e) => s + e.amount, 0)

  // total por perfil no mês
  const profileTotals = profiles
    .filter(p => p.active)
    .map(p => {
      const total = monthExpenses.reduce((sum, e) => {
        const sp = (allSplitsMap.get(e.id) ?? []).find(s => s.profile_id === p.id)
        return sum + (sp?.amount_owed ?? 0)
      }, 0)
      return { profile: p, total }
    })
    .filter(pt => pt.total > 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Olá, {profile?.display_name} 👋</h1>
        <p className="text-sm text-muted-foreground capitalize">{monthLabel(selectedMonth)}</p>
      </div>

      <MonthTabs months={months} value={selectedMonth} onChange={setSelectedMonth} />

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {/* Totais do mês */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card style={{ borderColor: 'var(--primary)', borderWidth: '1.5px' }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total do mês (casa)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>{currency.format(grandTotal)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Seu total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{currency.format(myTotal)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Por morador */}
          {profileTotals.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Por morador</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {profileTotals.map(({ profile: p, total }) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--primary)' }}>
                        {p.display_name[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">{p.display_name}</span>
                    </div>
                    <span className="text-sm font-semibold">{currency.format(total)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Calendário */}
          {monthExpenses.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground capitalize">Calendário — {monthLabel(selectedMonth)}</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthCalendar yearMonth={selectedMonth} expenses={monthExpenses} />
              </CardContent>
            </Card>
          )}

          {/* Detalhamento pessoal */}
          {mySplits.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suas despesas</h2>
              {mySplits.map(sp => {
                const exp = expenseById.get(sp.expense_id)
                return (
                  <div key={sp.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{exp?.description ?? '—'}</p>
                      {exp?.due_date && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(exp.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-semibold">{currency.format(sp.amount_owed)}</p>
                  </div>
                )
              })}
            </div>
          )}

          {mySplits.length === 0 && (
            <p className="text-muted-foreground">Nenhuma despesa para você neste mês.</p>
          )}
        </>
      )}
    </div>
  )
}
