import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { Wordmark } from '@/components/brand/pixel-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'

// Shared shell for everything reachable without logging in: landing, login, public tools.
export const Route = createFileRoute('/(public)')({ component: PublicLayout })

const NAV = [{ to: '/tools/position-size', label: 'Position size' }] as const

function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="flex h-16 items-center gap-6 px-4 sm:px-8">
          <Link to="/" aria-label="crypz home">
            <Wordmark className="text-lg" />
          </Link>
          <nav aria-label="Tools" className="hidden items-center gap-1 sm:flex">
            <span className="mr-2 label">Tools</span>
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: 'text-foreground bg-accent' }}
              >
                {n.label}
              </Link>
            ))}
            <span className="px-2.5 py-1.5 text-sm text-muted-foreground/60" aria-disabled>
              Risk <span className="label">Soon</span>
            </span>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm" variant="outline">
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </div>
        <nav aria-label="Tools" className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 sm:hidden">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="px-2.5 py-1 text-sm whitespace-nowrap text-muted-foreground"
              activeProps={{ className: 'text-foreground bg-accent' }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <footer className="border-t border-border">
        <div className="flex justify-between px-4 py-6 text-xs text-muted-foreground sm:px-8">
          <Wordmark />
          <span>API keys stay on your server.</span>
        </div>
      </footer>
    </div>
  )
}
