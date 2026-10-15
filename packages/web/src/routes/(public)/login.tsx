import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/(public)/login')({
  head: () => ({ meta: [{ title: 'Log in · crypz' }] }),
  component: Login,
})

// Dummy gate: no auth yet. Any submit goes straight to the dashboard.
function Login() {
  const navigate = useNavigate()
  return (
    <div className="grid flex-1">
      <main className="grid place-items-center px-4 py-16">
        <form
          className="flex w-full max-w-sm flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            navigate({ to: '/dashboard' })
          }}
        >
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">Log in</h1>
            <p className="text-sm text-muted-foreground">Authentication is not wired yet. Any details get you in.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@domain.com" autoComplete="email" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" />
          </div>
          <Button type="submit" size="lg">
            Log in <ArrowRight />
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Exchange keys are read from the server .env, never entered here.
          </p>
        </form>
      </main>
    </div>
  )
}
