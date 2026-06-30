import * as React from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { addGoalContribution, createGoal, fetchGoalContributions, fetchGoals, fetchProfiles, updateGoalStatus } from '@/lib/data'
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

  React.useEffect(() => {
    load()
  }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const targetNum = Number(targetAmount.replace(',', '.'))
    if (!name.trim() || !targetNum || targetNum <= 0) {
      setCreateError('Preencha nome e um valor alvo válido.')
      return
    }
    try {
      await createGoal({ name: name.trim(), description: description.trim() || undefined, target_amount: targetNum })
      setCreateOpen(false)
      setName('')
      setDescription('')
      setTargetAmount('')
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

  const profileName = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? '—'

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
                <Input
                  id="targetAmount"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  inputMode="decimal"
                />
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
                  <div>
                    <CardTitle className="text-base">{goal.name}</CardTitle>
                    {goal.description && <p className="text-sm text-muted-foreground">{goal.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    {goal.status === 'ativa' && (
                      <Button size="sm" onClick={() => openContribute(goal)}>
                        Contribuir
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleToggleStatus(goal)}>
                      {goal.status === 'ativa' ? 'Marcar concluída' : 'Reabrir'}
                    </Button>
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
              <Input
                id="contributeAmount"
                value={contributeAmount}
                onChange={(e) => setContributeAmount(e.target.value)}
                inputMode="decimal"
              />
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
