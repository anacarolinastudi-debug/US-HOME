import * as React from 'react'
import { createUser, deleteUser, resetPassword, updateProfile } from '@/lib/admin-api'
import { fetchActiveCapacities, fetchProfiles, setPaymentCapacities } from '@/lib/data'
import type { PaymentCapacityHistory, Profile, TabPermissions } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const TAB_LABELS: { key: keyof TabPermissions; label: string }[] = [
  { key: 'despesas', label: 'Despesas' },
  { key: 'recorrentes', label: 'Recorrentes' },
  { key: 'imprevistos', label: 'Imprevistos' },
  { key: 'metas', label: 'Metas' },
  { key: 'historico', label: 'Histórico' },
]

const DEFAULT_PERMISSIONS: TabPermissions = {
  despesas: true,
  recorrentes: true,
  imprevistos: true,
  metas: true,
  historico: true,
}

export function AdminPage() {
  const [profiles, setProfiles] = React.useState<Profile[]>([])
  const [capacities, setCapacities] = React.useState<PaymentCapacityHistory[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    const [allProfiles, activeCapacities] = await Promise.all([fetchProfiles(), fetchActiveCapacities()])
    setProfiles(allProfiles)
    setCapacities(activeCapacities)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  if (loading) return <p className="text-muted-foreground">Carregando…</p>

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Admin</h1>
      <CapacitySection profiles={profiles} capacities={capacities} onChanged={load} />
      <UsersSection profiles={profiles} onChanged={load} />
    </div>
  )
}

function CapacitySection({
  profiles,
  capacities,
  onChanged,
}: {
  profiles: Profile[]
  capacities: PaymentCapacityHistory[]
  onChanged: () => void
}) {
  const activeProfiles = profiles.filter((p) => p.active)
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    const initial: Record<string, string> = {}
    for (const p of activeProfiles) {
      const current = capacities.find((c) => c.profile_id === p.id)
      initial[p.id] = current ? String(current.percent) : '0'
    }
    setValues(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, capacities])

  const total = Object.values(values).reduce((sum, v) => sum + (Number(v.replace(',', '.')) || 0), 0)

  async function handleSave() {
    setError(null)
    if (Math.abs(total - 100) > 0.01) {
      setError(`A soma das porcentagens precisa ser 100%. Atualmente: ${total.toFixed(2)}%.`)
      return
    }
    setSaving(true)
    try {
      await setPaymentCapacities(
        activeProfiles.map((p) => ({ profile_id: p.id, percent: Number(values[p.id].replace(',', '.')) })),
      )
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capacidade de pagamento (%)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {activeProfiles.length === 0 && <p className="text-muted-foreground">Nenhum morador ativo.</p>}
        {activeProfiles.map((p) => (
          <div key={p.id} className="flex items-center gap-3">
            <Label className="w-40 text-left">{p.display_name}</Label>
            <Input
              value={values[p.id] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
              inputMode="decimal"
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        ))}
        <p className={`text-sm ${Math.abs(total - 100) > 0.01 ? 'text-destructive' : 'text-muted-foreground'}`}>
          Total: {total.toFixed(2)}%
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSave} disabled={saving} className="w-fit">
          {saving ? 'Salvando…' : 'Salvar capacidades'}
        </Button>
      </CardContent>
    </Card>
  )
}

function UsersSection({ profiles, onChanged }: { profiles: Profile[]; onChanged: () => void }) {
  const [createOpen, setCreateOpen] = React.useState(false)
  const [username, setUsername] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [permissions, setPermissions] = React.useState<TabPermissions>(DEFAULT_PERMISSIONS)
  const [createError, setCreateError] = React.useState<string | null>(null)

  const [editing, setEditing] = React.useState<Profile | null>(null)
  const [editError, setEditError] = React.useState<string | null>(null)
  const [newPassword, setNewPassword] = React.useState('')

  function openCreate() {
    setUsername('')
    setDisplayName('')
    setPassword('')
    setIsAdmin(false)
    setPermissions(DEFAULT_PERMISSIONS)
    setCreateError(null)
    setCreateOpen(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    if (!username.trim() || !displayName.trim() || !password) {
      setCreateError('Preencha usuário, nome e senha.')
      return
    }
    try {
      await createUser({ username: username.trim(), password, display_name: displayName.trim(), is_admin: isAdmin, permissions })
      setCreateOpen(false)
      onChanged()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'erro ao criar usuário')
    }
  }

  function openEdit(profile: Profile) {
    setEditing(profile)
    setNewPassword('')
    setEditError(null)
  }

  async function handleUpdate() {
    if (!editing) return
    setEditError(null)
    try {
      await updateProfile({
        profile_id: editing.id,
        display_name: editing.display_name,
        is_admin: editing.is_admin,
        permissions: editing.permissions,
        active: editing.active,
      })
      if (newPassword) {
        await resetPassword(editing.id, newPassword)
      }
      setEditing(null)
      onChanged()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'erro ao salvar')
    }
  }

  async function handleDelete(profile: Profile) {
    if (!confirm(`Excluir a conta de ${profile.display_name}? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteUser(profile.id)
      onChanged()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'erro ao excluir')
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Moradores</CardTitle>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>Novo morador</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo morador</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="username">Usuário (login)</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="displayName">Nome</Label>
                <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="isAdmin" checked={isAdmin} onCheckedChange={(v) => setIsAdmin(!!v)} />
                <Label htmlFor="isAdmin">É admin</Label>
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label>Abas liberadas</Label>
                {TAB_LABELS.map((tab) => (
                  <div key={tab.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`perm-${tab.key}`}
                      checked={permissions[tab.key]}
                      onCheckedChange={(v) => setPermissions((prev) => ({ ...prev, [tab.key]: !!v }))}
                    />
                    <Label htmlFor={`perm-${tab.key}`}>{tab.label}</Label>
                  </div>
                ))}
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <DialogFooter>
                <Button type="submit">Criar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-md border p-3">
            <div className="text-left">
              <p className="font-medium">
                {p.display_name} <span className="text-sm text-muted-foreground">@{p.username}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {p.is_admin ? 'Admin · ' : ''}
                {p.active ? 'Ativo' : 'Inativo'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                Editar
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleDelete(p)}>
                Excluir
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {editing?.display_name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="editDisplayName">Nome</Label>
                <Input
                  id="editDisplayName"
                  value={editing.display_name}
                  onChange={(e) => setEditing({ ...editing, display_name: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="editIsAdmin"
                  checked={editing.is_admin}
                  onCheckedChange={(v) => setEditing({ ...editing, is_admin: !!v })}
                />
                <Label htmlFor="editIsAdmin">É admin</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="editActive"
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: !!v })}
                />
                <Label htmlFor="editActive">Ativo (entra no rateio)</Label>
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label>Abas liberadas</Label>
                {TAB_LABELS.map((tab) => (
                  <div key={tab.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`edit-perm-${tab.key}`}
                      checked={editing.permissions[tab.key]}
                      onCheckedChange={(v) =>
                        setEditing({ ...editing, permissions: { ...editing.permissions, [tab.key]: !!v } })
                      }
                    />
                    <Label htmlFor={`edit-perm-${tab.key}`}>{tab.label}</Label>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="newPassword">Nova senha (opcional)</Label>
                <Input id="newPassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <DialogFooter>
                <Button onClick={handleUpdate}>Salvar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
