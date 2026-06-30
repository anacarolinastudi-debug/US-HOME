import * as React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { completeSignupProfile } from '@/lib/data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Tab = 'entrar' | 'cadastrar'

export function LoginPage() {
  const { session, signIn, signUp } = useAuth()
  const [tab, setTab] = React.useState<Tab>('entrar')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [signupStep, setSignupStep] = React.useState<'form' | 'profile'>('form')
  const [pendingUsername, setPendingUsername] = React.useState('')

  if (session) return <Navigate to="/" replace />

  function switchTab(t: Tab) {
    setTab(t)
    setError(null)
    setUsername('')
    setPassword('')
    setDisplayName('')
    setConfirmPassword('')
    setSignupStep('form')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(username, password)
    setLoading(false)
    if (error) setError(error)
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return }
    if (username.trim().length < 3) { setError('O usuário precisa ter ao menos 3 caracteres.'); return }
    setLoading(true)
    const { error, sessionCreated } = await signUp(username.trim(), password)
    setLoading(false)
    if (error) { setError(error); return }
    if (sessionCreated) {
      setPendingUsername(username.trim())
      setSignupStep('profile')
    } else {
      setError('Conta criada, mas não foi possível iniciar sessão automaticamente. Tente entrar.')
      setTab('entrar')
    }
  }

  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!displayName.trim()) { setError('Informe seu nome.'); return }
    setLoading(true)
    try {
      await completeSignupProfile(pendingUsername, displayName.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Nossa Casa</CardTitle>
          <CardDescription>
            {tab === 'entrar' ? 'Entre com seu usuário e senha.' : 'Crie sua conta de morador.'}
          </CardDescription>
          {signupStep !== 'profile' && (
            <div className="mt-2 flex gap-2">
              <Button variant={tab === 'entrar' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => switchTab('entrar')}>
                Entrar
              </Button>
              <Button variant={tab === 'cadastrar' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => switchTab('cadastrar')}>
                Criar conta
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {tab === 'entrar' && (
            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="username">Usuário</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">{loading ? 'Entrando…' : 'Entrar'}</Button>
            </form>
          )}

          {tab === 'cadastrar' && signupStep === 'form' && (
            <form onSubmit={handleSignUp} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="su-username">Usuário (para login)</Label>
                <Input id="su-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="su-password">Senha</Label>
                <Input id="su-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="su-confirm">Confirmar senha</Label>
                <Input id="su-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">{loading ? 'Criando…' : 'Criar conta'}</Button>
            </form>
          )}

          {tab === 'cadastrar' && signupStep === 'profile' && (
            <form onSubmit={handleCompleteProfile} className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">Quase lá! Agora diga como quer ser chamado na casa.</p>
              <div className="flex flex-col gap-2 text-left">
                <Label htmlFor="displayName">Seu nome</Label>
                <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">{loading ? 'Salvando…' : 'Entrar na Nossa Casa'}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
