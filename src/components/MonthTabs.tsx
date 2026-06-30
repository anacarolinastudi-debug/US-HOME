import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(yearMonth: string) {
  return new Date(yearMonth + '-02T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function buildMonthList(monthsWithData: string[]) {
  const set = new Set([currentYearMonth(), ...monthsWithData])
  return [...set].sort((a, b) => b.localeCompare(a))
}

export function MonthTabs({ months, value, onChange }: { months: string[]; value: string; onChange: (m: string) => void }) {
  if (months.length === 0) return null
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
        {months.map(m => (
          <TabsTrigger
            key={m}
            value={m}
            className="rounded-full border bg-card px-3 py-1.5 text-xs capitalize data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
          >
            {monthLabel(m)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
