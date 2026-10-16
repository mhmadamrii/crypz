import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoginArt } from '@/components/landing/login-art'
import { authClient } from '@/lib/auth-client'
import { searchText } from '@/lib/search'
import { seo } from '@/lib/seo'

type Search = { redirect?: string; mode?: 'signup' }

export const Route = createFileRoute('/(public)/login')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    // only same-site paths, never an absolute URL to somewhere else
    redirect: /^\/(?!\/)/.test(searchText(s.redirect) ?? '') ? searchText(s.redirect) : undefined,
    mode: s.mode === 'signup' ? 'signup' : undefined,
  }),
  head: () =>
    seo({
      title: 'Log in · crypz',
      description: 'Log in to crypz, or create an account to practise with bar-by-bar replay.',
      path: '/login',
      noindex: true,
    }),
  component: Login,
})

function Login() {
  const { redirect, mode } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const signup = mode === 'signup'
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (form: FormData) => {
    setBusy(true)
    setError(null)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    const res = signup
      ? await authClient.signUp.email({ email, password, name: String(form.get('name') || email.split('@')[0]) })
      : await authClient.signIn.email({ email, password })
    setBusy(false)
    if (res.error) return setError(res.error.message ?? 'Could not sign you in.')
    queryClient.clear() // nothing cached for a previous user survives a sign-in
    router.history.push(redirect ?? '/okx/overview')
  }

  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      {/* the drawing side: decorative, so phones get straight to the form */}
      <aside aria-hidden className="relative hidden flex-col border-r border-border lg:flex">
        <div className="flex flex-col gap-2 px-8 pt-10">
          <p className="text-3xl font-semibold tracking-[-0.03em] text-balance">Mark it up. Then step forward.</p>
          <p className="max-w-[44ch] text-sm text-pretty text-muted-foreground">
            Fib, trend lines and position zones on any day you replay, with the next bar still hidden.
          </p>
        </div>
        <div className="relative min-h-0 flex-1 text-foreground">
          <LoginArt className="absolute inset-0 h-full w-full" />
        </div>
        <p className="border-t border-border px-8 py-3 label">Illustration · synthetic candles</p>
      </aside>
      <main className="grid place-items-center px-4 py-16 lg:px-12">
        <form
          className="flex w-full max-w-sm flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            void submit(new FormData(e.currentTarget))
          }}
        >
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">{signup ? 'Create your account' : 'Log in'}</h1>
            <p className="text-sm text-muted-foreground">
              {signup ? 'Email and a password of 10+ characters.' : 'Welcome back to your desk.'}
            </p>
          </div>
          {signup && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" placeholder="optional" />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="you@domain.com" autoComplete="email" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={signup ? 10 : undefined}
              autoComplete={signup ? 'new-password' : 'current-password'}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-down">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'One moment…' : signup ? 'Create account' : 'Log in'} {!busy && <ArrowRight />}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {signup ? 'Already have an account?' : 'New here?'}{' '}
            <button
              type="button"
              className="text-foreground underline underline-offset-4"
              onClick={() => {
                setError(null)
                navigate({ search: (s) => ({ ...s, mode: signup ? undefined : 'signup' }), replace: true })
              }}
            >
              {signup ? 'Log in' : 'Create an account'}
            </button>
          </p>
        </form>
      </main>
    </div>
  )
}
