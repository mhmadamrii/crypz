import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

/** Sticky top bar shared by every app page: sidebar toggle, title, page controls, theme. */
export function PageHeader({
  title,
  source,
  lead,
  children,
}: {
  title: string
  /** Where the page's data comes from, e.g. "OKX": the exchange an Account page reads, or the Market feed. */
  source?: string
  lead?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background">
      <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-8">
        <SidebarTrigger className="-ml-1.5" />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {source && <span className="hidden border border-border px-1.5 py-0.5 label sm:inline">{source}</span>}
        {lead}
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
