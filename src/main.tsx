import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { supabaseConfigured } from './lib/supabase.ts'

const root = createRoot(document.getElementById('root')!)

if (!supabaseConfigured) {
  root.render(
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Configuração ausente</h1>
        <p style={{ color: '#666', fontSize: '0.875rem' }}>
          As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não estão configuradas neste ambiente.
        </p>
      </div>
    </div>,
  )
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
