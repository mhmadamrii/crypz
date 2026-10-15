import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CandlestickChart, LayoutGrid, LogOut, Rows3, Timer } from 'lucide-react'
import type { ExchangeStatus } from '@crypz/exchanges'
import { PixelLogo } from '@/components/brand/pixel-logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '#overview', label: 'Overview', icon: LayoutGrid },
  { href: '#chart', label: 'Chart & insights', icon: CandlestickChart },
  { href: '#timing', label: 'Timing & sizing', icon: Timer },
  { href: '#history', label: 'Position history', icon: Rows3 },
]

function RailItem({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function AppShell({ exchanges, children }: { exchanges: ExchangeStatus[]; children: ReactNode }) {
  return (
    <div className="min-h-dvh md:pl-16">
      <nav
        aria-label="Dashboard"
        className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center border-r border-border bg-background py-5 md:flex"
      >
        <Link to="/" aria-label="crypz home" className="mb-8">
          <PixelLogo className="size-6" />
        </Link>
        <ul className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <RailItem label={label}>
                <a
                  href={href}
                  aria-label={label}
                  className="grid size-10 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="size-[18px]" strokeWidth={1.5} />
                </a>
              </RailItem>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col items-center gap-4">
          {exchanges.map((e) => (
            <RailItem key={e.id} label={`${e.name} · ${e.configured ? 'connected' : 'not connected'}`}>
              <span className="flex flex-col items-center gap-1">
                <i
                  className={cn(
                    'size-2',
                    e.configured ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--muted-foreground)]',
                  )}
                />
                <span className="num text-[9px] text-muted-foreground uppercase">
                  {e.id === 'binance' ? 'BIN' : e.name}
                </span>
              </span>
            </RailItem>
          ))}
          <RailItem label="Log out">
            <Link
              to="/"
              aria-label="Log out"
              className="grid size-10 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LogOut className="size-4" strokeWidth={1.5} />
            </Link>
          </RailItem>
        </div>
      </nav>
      {children}
    </div>
  )
}
