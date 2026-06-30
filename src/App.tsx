import type { ReactNode } from 'react'
import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import { AppShell } from '@/components/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { ExpensesPage } from '@/pages/ExpensesPage'
import { RecurringPage } from '@/pages/RecurringPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { AdminPage } from '@/pages/AdminPage'

function ProtectedLayout() {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  return <AppShell />
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (!profile?.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<ExpensesPage mode="all" />} />
            <Route path="/recorrentes" element={<RecurringPage />} />
            <Route path="/imprevistos" element={<ExpensesPage mode="imprevistos" />} />
            <Route path="/metas" element={<GoalsPage />} />
            <Route path="/historico" element={<HistoryPage />} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminPage />
                </RequireAdmin>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
