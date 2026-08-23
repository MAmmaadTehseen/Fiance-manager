import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { initSupabase } from '@batwa/core'
import { env } from '@/lib/env'
import { AuthProvider } from '@/lib/auth'
import { ThemeProvider } from '@/lib/theme'
import { DevBanner } from '@/components/DevBanner'
import { App } from '@/app/App'
import './index.css'

// Boot the shared client before any hook can run. The data layer lives in
// @batwa/core and is used by both apps, so each supplies its own config.
initSupabase({ url: env.supabaseUrl, anonKey: env.supabaseAnonKey })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Financial data changes when the user acts or an SMS lands, not on a
      // timer — so refetch on focus, but don't poll.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <DevBanner />
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
