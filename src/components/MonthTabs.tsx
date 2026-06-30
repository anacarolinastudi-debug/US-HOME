import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function nextYearMonth(yearMonth = currentYearMonth()) {
  const [year, month] = yearMonth.split('-').map(Number)
  const date = new Date(year, month, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(yearMonth: string) {
  return new Date(yearMonth + '-02T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function buildMonthList(monthsWithData: string[]) {
  const current = currentYearMonth()
  const set = new Set([current, nextYearMonth(current), ...monthsWithData])
  return [...set].sort((a, b) => b.localeCompare(a))
}

export function MonthTabs({ months, value, onChange }: { months: string[]; value: string; onChange: (m: string) => void }) {
  if (months.length === 0) return null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full max-w-xs capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {months.map(m => (
          <SelectItem key={m} value={m} className="capitalize">
            {monthLabel(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
