import type { ExchangeStatus } from '@crypz/exchanges'

import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import { PixelLogo } from '@/components/brand/pixel-logo'

import {
  CandlestickChart,
  ChartColumn,
  ChevronsUpDown,
  KeyRound,
  LayoutGrid,
  LogOut,
  Newspaper,
  Rows3,
  Calculator,
  ShieldAlert,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

type NavItem = { label: string; icon: LucideIcon } & ({ to: '/dashboard' | '/trade' | '/positions' } | { soon: true })

// Each main menu entry gets its own page; "soon" entries are listed but not routable yet.
const NAV: NavItem[] = [
  { label: 'Overview', icon: LayoutGrid, to: '/dashboard' },
  { label: 'Trade', icon: CandlestickChart, to: '/trade' },
  { label: 'Positions', icon: Rows3, to: '/positions' },
  { label: 'Analytics', icon: ChartColumn, soon: true },
  { label: 'Insights', icon: ScanSearch, soon: true },
  { label: 'News', icon: Newspaper, soon: true },
]

function StatusSquare({ on }: { on: boolean }) {
  return (
    <i
      aria-hidden
      className={cn('size-2 shrink-0', on ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--muted-foreground)]')}
    />
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

export function AppSidebar({
  exchanges,
  user,
}: {
  exchanges: ExchangeStatus[]
  user: { name: string; email: string }
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const signOut = async () => {
    await authClient.signOut()
    queryClient.clear()
    navigate({ to: '/' })
  }
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="crypz home">
              <Link to="/">
                <span className="grid size-8 shrink-0 place-items-center">
                  <PixelLogo className="size-5" />
                </span>
                <span className="text-base font-semibold tracking-[-0.03em]">crypz</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="label">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const Icon = item.icon
                if ('soon' in item)
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton disabled tooltip={`${item.label} · coming soon`} aria-disabled>
                        <Icon strokeWidth={1.5} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="label">Soon</SidebarMenuBadge>
                    </SidebarMenuItem>
                  )
                const active = pathname.startsWith(item.to)
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link to={item.to}>
                        <Icon strokeWidth={1.5} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {active && (
                      <i
                        aria-hidden
                        className="absolute top-1/2 right-2 size-1.5 -translate-y-1/2 bg-foreground group-data-[collapsible=icon]:hidden"
                      />
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="label">Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Position size calculator">
                  <Link to="/tools/position-size">
                    <Calculator strokeWidth={1.5} />
                    <span>Position size</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled aria-disabled tooltip="Risk calculator · coming soon">
                  <ShieldAlert strokeWidth={1.5} />
                  <span>Risk</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="label">Soon</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel className="label">Exchanges</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {exchanges.map((e) => (
                <SidebarMenuItem key={e.id}>
                  <SidebarMenuButton asChild tooltip={`${e.name} · ${e.configured ? 'connected' : 'not connected'}`}>
                    <Link to="/settings/exchanges">
                      <span className="grid size-4 place-items-center">
                        <StatusSquare on={e.configured} />
                      </span>
                      <span className="group-data-[collapsible=icon]:hidden">{e.name}</span>
                      <span className="ml-auto label group-data-[collapsible=icon]:hidden">
                        {e.configured ? 'Live' : 'Off'}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip="Account">
                  <span className="grid size-8 shrink-0 place-items-center bg-foreground num text-xs font-medium text-background">
                    {initials(user.name)}
                  </span>
                  <span className="flex min-w-0 flex-col text-left leading-tight">
                    <span className="truncate text-sm font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto" strokeWidth={1.5} />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="min-w-52">
                <DropdownMenuLabel className="label">Signed in</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings/exchanges">
                    <KeyRound /> Exchange keys
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
