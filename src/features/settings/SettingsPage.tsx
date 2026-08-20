import { LogOut } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { ConnectPhone } from './ConnectPhone'

export function SettingsPage() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />

      <div className="flex flex-col gap-6 px-4 md:px-0">
        <ConnectPhone />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Account</h2>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="mt-0.5 truncate font-medium">{user?.email}</p>
          </Card>

          <Button
            variant="outline"
            onClick={() => void signOut()}
            className="justify-start"
          >
            <LogOut />
            Sign out
          </Button>
        </section>
      </div>
    </div>
  )
}
