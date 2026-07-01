import * as React from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { addGoalContribution, createGoal, deleteGoal, fetchGoalContributions, fetchGoals, fetchProfiles, updateGoalStatus } from '@/lib/data'
import type { Goal, GoalContribution, Profile } from '@/lib/database.types'
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

function daysLeft(targetDate: string) {
  const diff = Math.ceil((new Date(targetDate + 'T12:00:00').getTime() - Date.now()) / 86400000)
  if (diff < 0) return 'prazo encerrado'
  if (diff === 0) return 'vence hoje'
  return `${diff} dia${diff !== 1 ? 's' : ''} restante${diff !== 1 ? 's' : ''}`
}

export function GoalsPage() {
  const { profile } = useAuth()
  const [goals, setGoals] = React.useState<Goal[]>([])
  const [contributions, setContributions] = React.useState<GoalContribution[]>([])
  const [profiles, setProfiles] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [targetAmount, setTargetAmount] = React.useState('')
  const [targetDate, setTargetDate] = React.useState('')
  const [createError, setCreateError] = React.useState<string | null>(null)

  const [contributeGoal, setContributeGoal] = React.useState<Goal | null>(null)
  const [contributeAmount, setContributeAmount] = React.useState('')
  const [contributeNote, setContributeNote] = React.useState('')
  const [contributeError, setContributeError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const [allGoals, allProfiles] = await Promise.all([fetchGoals(), fetchProfiles()])
    setGoals(allGoals)
    setProfiles(allProfiles)
    setContributions(await fetchGoalContributions(allGoals.map((g) => g.id)))
    setLoading(false)
  }, [])

  React.useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const targetNum = Number(targetAmount.replace(',', '.'))
    if (!name.trim() || !targetNum || targetNum <= 0) {
      setCreateError('Preencha nome e um valor alvo válido.')
      return
    }
    try {
      await createGoal({
        name: name.trim(),
        description: description.trim() || undefined,
        target_amount: targetNum,
        target_date: targetDate || undefined,
      })
      setCreateOpen(false)
      setName('')
      setDescription('')
      setTargetAmount('')
      setTargetDate('')
      await load()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'erro ao salvar')
    }
  }

  function openContribute(goal: Goal) {
    setContributeGoal(goal)
    setContributeAmount('')
    setContributeNote('')
    setContributeError(null)
  }

  async function handleContribute(e: React.FormEvent) {
    e.preventDefault()
    if (!contributeGoal || !profile) return
    setContributeError(null)
    const amountNum = Number(contributeAmount.replace(',', '.'))
    if (!amountNum || amountNum <= 0) {
      setContributeError('Informe um valor válido.')
      return
    }
    try {
      await addGoalContribution({
        goal_id: contributeGoal.id,
        profile_id: profile.id,
        amount: amountNum,
        note: contributeNote.trim() || undefined,
      })
      setContributeGoal(null)
      await load()
    } catch (err) {
      setContributeError(err instanceof Error ? err.message : 'erro ao salvar')
    }
  }

  async function handleToggleStatus(goal: Goal) {
    await updateGoalStatus(goal.id, goal.status === 'ativa' ? 'concluida' : 'ativa')
    await load()
  }

  async function handleDelete(goal: Goal) {
    if (!confirm(`Excluir a meta "${goal.name}"? Esta ação não pode ser desfeita.`)) return
    await deleteGoal(goal.id)
    await load()
  }

  const profileName = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? '—'
  const canManage = profile?.is_admin

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Metas</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>Nova meta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova meta</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="name">Nome (ex: comprar armários)</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="targetAmount">Valor alvo (R$)</Label>
                <Input id="targetAmount" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} inputMode="decimal" />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="targetDate">Data limite (opcional)</Label>
                <Input id="targetDate" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="w-44" />
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <DialogFooter>
                <Button type="submit">Salvar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : goals.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma meta criada ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map((goal) => {
            const goalContributions = contributions.filter((c) => c.goal_id === goal.id)
            const saved = goalContributions.reduce((sum, c) => sum + c.amount, 0)
            const progress = Math.min(100, Math.round((saved / goal.target_amount) * 100))
            return (
              <Card key={goal.id} className={goal.status === 'concluida' ? 'opacity-70' : ''}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{goal.name}</CardTitle>
                    {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
                    {goal.target_date && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Prazo: {new Date(goal.target_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        {goal.status === 'ativa' && (
                          <span className={`ml-1.5 font-medium ${daysLeft(goal.target_date) === 'prazo encerrado' ? 'text-destructive' : 'text-primary'}`}>
                            · {daysLeft(goal.target_date)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    {goal.status === 'ativa' && (
                      <Button size="sm" onClick={() => openContribute(goal)}>Contribuir</Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleToggleStatus(goal)}>
                      {goal.status === 'ativa' ? 'Concluir' : 'Reabrir'}
                    </Button>
                    {canManage && (
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(goal)}>Excluir</Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mb-2 text-sm text-muted-foreground">
                    {currency.format(saved)} de {currency.format(goal.target_amount)} ({progress}%)
                  </p>
                  {goalContributions.length > 0 && (
                    <ul className="text-sm text-muted-foreground">
                      {goalContributions.map((c) => (
                        <li key={c.id}>
                          {profileName(c.profile_id)}: {currency.format(c.amount)}
                          {c.note ? ` — ${c.note}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!contributeGoal} onOpenChange={(v) => !v && setContributeGoal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contribuir para "{contributeGoal?.name}"</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleContribute} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 text-left">
              <Label htmlFor="contributeAmount">Valor (R$)</Label>
              <Input id="contributeAmount" value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)} inputMode="decimal" />
            </div>
            <div className="flex flex-col gap-2 text-left">
              <Label htmlFor="contributeNote">Observação (opcional)</Label>
              <Input id="contributeNote" value={contributeNote} onChange={(e) => setContributeNote(e.target.value)} />
            </div>
            {contributeError && <p className="text-sm text-destructive">{contributeError}</p>}
            <DialogFooter>
              <Button type="submit">Contribuir</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
