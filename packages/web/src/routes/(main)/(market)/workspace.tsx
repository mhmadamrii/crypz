import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { LayoutPanelTop, MoreHorizontal, Plus } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DEFAULT_STATE, newWidgetId, type WidgetKind, type WorkspaceState } from '@/components/workspace/model'
import { WorkspaceGrid } from '@/components/workspace/workspace-grid'
import { WIDGETS } from '@/components/workspace/widgets'
import { api, unwrap } from '@/lib/api'
import { MARKET_EXCHANGE_NAME } from '@/lib/market'
import { useFeedStatus } from '@/lib/okx-ws'
import { workspacesQuery } from '@/lib/queries'
import { searchText } from '@/lib/search'
import { cn } from '@/lib/utils'

type Search = { w?: string }

export const Route = createFileRoute('/(main)/(market)/workspace')({
  validateSearch: (s: Record<string, unknown>): Search => ({ w: searchText(s.w) }),
  head: () => ({ meta: [{ title: 'Workspace · crypz' }] }),
  component: Workspace,
})

type Ws = { id: string; name: string; position: number; state: WorkspaceState; updatedAt: string }

function Workspace() {
  const q = useQuery(workspacesQuery())
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const list = (q.data ?? []) as Ws[]
  const active = list.find((w) => w.id === search.w) ?? list[0]
  const [dialog, setDialog] = useState<null | 'new' | 'rename' | 'delete'>(null)

  const setList = (fn: (l: Ws[]) => Ws[]) =>
    queryClient.setQueryData(workspacesQuery().queryKey, (l) => fn((l ?? []) as Ws[]) as never)

  const create = useMutation({
    mutationFn: (name: string) => unwrap(api.workspaces.$post({ json: { name, state: DEFAULT_STATE } })),
    onSuccess: (ws) => {
      setList((l) => [...l, ws as Ws])
      navigate({ search: { w: ws.id }, replace: true })
      setDialog(null)
    },
  })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      unwrap(api.workspaces[':id'].$put({ param: { id }, json: { name } })).then(() => ({ id, name })),
    onSuccess: ({ id, name }) => {
      setList((l) => l.map((w) => (w.id === id ? { ...w, name } : w)))
      setDialog(null)
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.workspaces[':id'].$delete({ param: { id } })).then(() => id),
    onSuccess: (id) => {
      setList((l) => l.filter((w) => w.id !== id))
      navigate({ search: {}, replace: true })
      setDialog(null)
    },
  })

  return (
    <>
      <PageHeader title="Workspace" source={`${MARKET_EXCHANGE_NAME} data`} lead={<FeedPill />}>
        {active && (
          <>
            <Select value={active.id} onValueChange={(id) => navigate({ search: { w: id }, replace: true })}>
              <SelectTrigger size="sm" className="w-36 sm:w-44" aria-label="Workspace">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {list.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="Workspace options">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog('new')}>New workspace</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog('rename')}>Rename</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialog('delete')} disabled={list.length < 2}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </PageHeader>

      <main className="flex w-full flex-1 flex-col px-3 py-3 sm:px-4">
        {q.isPending ? (
          <p className="grid flex-1 place-items-center label">Loading your workspace…</p>
        ) : q.isError ? (
          <p className="grid flex-1 place-items-center text-sm text-down">{q.error.message}</p>
        ) : (
          active && (
            <WorkspaceView
              key={active.id}
              ws={active}
              onSaved={(state) => setList((l) => l.map((w) => (w.id === active.id ? { ...w, state } : w)))}
            />
          )
        )}
      </main>

      <NameDialog
        open={dialog === 'new' || dialog === 'rename'}
        title={dialog === 'new' ? 'New workspace' : 'Rename workspace'}
        initial={dialog === 'rename' ? (active?.name ?? '') : ''}
        busy={create.isPending || rename.isPending}
        error={(create.error ?? rename.error)?.message}
        onClose={() => setDialog(null)}
        onSubmit={(name) => (dialog === 'new' ? create.mutate(name) : active && rename.mutate({ id: active.id, name }))}
      />
      <Dialog open={dialog === 'delete'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{active?.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Its widgets and layout go with it. Other workspaces are untouched.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              onClick={() => active && remove.mutate(active.id)}
              disabled={remove.isPending}
            >
              Delete workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function WorkspaceView({ ws, onSaved }: { ws: Ws; onSaved: (s: WorkspaceState) => void }) {
  const [state, setState] = useState(ws.state)
  const save = useMutation({
    mutationFn: (next: WorkspaceState) =>
      unwrap(api.workspaces[':id'].$put({ param: { id: ws.id }, json: { state: next } })),
    onSuccess: (_, next) => onSaved(next),
  })
  const change = (next: WorkspaceState) => {
    setState(next)
    save.mutate(next)
  }

  const add = (kind: WidgetKind) => {
    const { w, h } = WIDGETS[kind].size
    const id = newWidgetId()
    const y = state.layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    change({
      ...state,
      widgets: [...state.widgets, { id, kind, link: 1, settings: kind === 'chart' ? { bar: '1H' } : {} }],
      layout: [...state.layout, { i: id, x: 0, y, w, h }],
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <AddWidget onAdd={add} />
        <span className={cn('label', save.isError && 'text-down')} aria-live="polite">
          {save.isError ? 'Could not save the last change' : save.isPending ? 'Saving…' : 'Saved'}
        </span>
      </div>
      {state.widgets.length ? (
        <WorkspaceGrid state={state} onChange={change} />
      ) : (
        <div className="grid place-items-center border border-dashed border-border py-24 text-center">
          <LayoutPanelTop className="mb-3 size-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm font-medium">Empty workspace</p>
          <p className="mt-1 text-sm text-muted-foreground">Add a chart, order book or tape to start.</p>
        </div>
      )}
    </div>
  )
}

function AddWidget({ onAdd }: { onAdd: (k: WidgetKind) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Add widget
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        <ul>
          {(Object.keys(WIDGETS) as WidgetKind[]).map((k) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => {
                  onAdd(k)
                  setOpen(false)
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="text-sm font-medium">{WIDGETS[k].title}</span>
                <span className="text-xs text-pretty text-muted-foreground">{WIDGETS[k].description}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function FeedPill() {
  const status = useFeedStatus()
  const label = { idle: 'Idle', connecting: 'Connecting', live: 'Live', retrying: 'Reconnecting' }[status]
  return (
    <span className="hidden items-center gap-1.5 label sm:flex" aria-live="polite">
      <i
        className={cn(
          'size-1.5',
          status === 'live' ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--muted-foreground)]',
        )}
      />
      {label}
    </span>
  )
}

function NameDialog({
  open,
  title,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  initial: string
  busy: boolean
  error?: string
  onClose: () => void
  onSubmit: (name: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {/* keyed on open, so the field starts from `initial` each time without syncing state */}
        <form
          key={String(open)}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
            if (name) onSubmit(name)
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <Input name="name" defaultValue={initial} maxLength={40} placeholder="e.g. Scalp, Swing" autoFocus />
          {error && <p className="text-sm text-down">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
