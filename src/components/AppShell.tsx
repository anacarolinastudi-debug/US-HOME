import * as React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Receipt, AlertTriangle, Target,
  ArrowLeftRight, Settings, LogOut, Menu, X,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: null as string | null, end: true },
  { to: '/despesas', label: 'Despesas', icon: Receipt, perm: 'despesas', end: false },
  { to: '/imprevistos', label: 'Imprevistos', icon: AlertTriangle, perm: 'imprevistos', end: false },
  { to: '/metas', label: 'Metas', icon: Target, perm: 'metas', end: false },
  { to: '/saldos', label: 'Saldos', icon: ArrowLeftRight, perm: 'saldos', end: false },
]

function NavItem({ to, label, Icon, end, onClick }: { to: string; label: string; Icon: React.ElementType; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        borderRadius: '0.5rem', padding: '0.625rem 0.75rem',
        fontSize: '0.875rem', fontWeight: 500, transition: 'background 0.15s',
        background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
        color: isActive ? 'var(--sidebar-active-fg)' : 'var(--sidebar-muted)',
      })}
      onMouseEnter={(e) => { if (!(e.currentTarget as HTMLElement).style.background.includes('active')) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-hover-bg)' }}
      onMouseLeave={(e) => { if (!(e.currentTarget as HTMLElement).getAttribute('data-active')) (e.currentTarget as HTMLElement).style.background = '' }}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </NavLink>
  )
}

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const { profile, signOut } = useAuth()
  const visibleItems = NAV_ITEMS.filter(item =>
    item.perm === null ? true :
    profile?.is_admin ? true :
    !!profile?.permissions?.[item.perm as keyof typeof profile.permissions]
  )

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--sidebar-bg)' }}>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div translate="no" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg font-bold text-sm text-white" style={{ background: 'var(--sidebar-active-bg)' }}>🏠</div>
        <span className="text-lg font-bold" style={{ color: 'var(--sidebar-fg)' }}>Nossa Casa</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 pb-4">
        {visibleItems.map(item => (
          <NavItem key={item.to} to={item.to} label={item.label} Icon={item.icon} end={item.end} onClick={onNav} />
        ))}
        {profile?.is_admin && (
          <NavItem to="/admin" label="Admin" Icon={Settings} onClick={onNav} />
        )}
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--sidebar-active-bg)' }}>
            {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: 'var(--sidebar-fg)' }}>{profile?.display_name}</p>
            <p className="truncate text-xs" style={{ color: 'var(--sidebar-muted)' }}>@{profile?.username}</p>
          </div>
          <button onClick={signOut} title="Sair" className="rounded-md p-1.5 transition-colors hover:bg-white/10" style={{ color: 'var(--sidebar-muted)' }}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = React.useState(false)

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col" style={{ background: 'var(--sidebar-bg)' }}>
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Mobile drawer */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 w-56 transition-transform duration-200 md:hidden',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <SidebarContent onNav={() => setDrawerOpen(false)} />
        <button
          className="absolute right-2 top-3 rounded-md p-1.5 hover:bg-white/10"
          onClick={() => setDrawerOpen(false)}
          style={{ color: 'var(--sidebar-muted)' }}
        >
          <X className="h-4 w-4" />
        </button>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-bold text-primary">Nossa Casa</span>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
