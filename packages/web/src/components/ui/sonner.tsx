import { LoaderCircle, X } from 'lucide-react'
import { Toaster as Sonner } from 'sonner'

// Toasts in the Trade Mosaic: a flat Popover rectangle with a 1px Border, no radius and no shadow. The status mark
// is the world's square (filled = done, hollow = information, toned down = failed), the action an inverted button
// like every primary, and the close a ghost X. Unstyled, so Sonner's own rounded card never shows through.

const square = (className: string) => <i aria-hidden className={`mt-1 block size-2 shrink-0 ${className}`} />

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      gap={8}
      icons={{
        success: square('bg-foreground'),
        info: square('shadow-[inset_0_0_0_1px_var(--foreground)]'),
        warning: square('shadow-[inset_0_0_0_1px_var(--down)]'),
        error: square('bg-down'),
        loading: <LoaderCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground motion-safe:animate-spin" />,
        close: <X className="size-3.5" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: 'Dismiss',
        classNames: {
          toast:
            'flex w-[var(--width)] items-start gap-2.5 border border-border bg-popover px-3 py-2.5 text-sm text-popover-foreground',
          icon: 'flex shrink-0',
          content: 'flex min-w-0 flex-1 flex-col gap-0.5',
          title: 'font-medium text-pretty',
          description: 'text-xs text-pretty text-muted-foreground',
          actionButton:
            'h-7 shrink-0 self-center bg-foreground px-2.5 text-xs font-medium text-background hover:bg-foreground/90 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-foreground',
          closeButton:
            'order-last -mr-1 grid size-6 shrink-0 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-1 focus-visible:outline-foreground',
        },
      }}
    />
  )
}
