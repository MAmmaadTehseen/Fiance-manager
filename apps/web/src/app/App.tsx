import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { AppLayout } from '@/app/AppLayout'
import { LandingPage } from '@/features/marketing/LandingPage'
import { DownloadPage } from '@/features/marketing/DownloadPage'
import { SignInPage } from '@/features/auth/SignInPage'
import { SignUpPage } from '@/features/auth/SignUpPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import { InboxPage } from '@/features/inbox/InboxPage'
import { BudgetsPage } from '@/features/budgets/BudgetsPage'
import { InsightsPage } from '@/features/insights/InsightsPage'
import { GoalsPage } from '@/features/goals/GoalsPage'
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
        {/* Signed out, `/` is the public homepage. Once there's a session the
            same path is the dashboard, so the app never shows marketing to
            someone who has already signed in. */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/download" element={<DownloadPage />} />
      {/* Reachable signed-in too: the recovery link establishes a session, so
          the reset form must render regardless of which route tree is active. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
