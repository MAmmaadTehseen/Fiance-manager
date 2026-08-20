import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { AppLayout } from '@/app/AppLayout'
import { SignInPage } from '@/features/auth/SignInPage'
import { SignUpPage } from '@/features/auth/SignUpPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div
        className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary"
        role="status"
        aria-label="Loading"
      />
    </div>
  )
}

export function App() {
  const { user, loading } = useAuth()

  if (loading) return <FullPageSpinner />

  if (!user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
