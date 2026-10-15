import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, unwrap } from '@/lib/api'
import { connectionsQuery, portfolioQuery } from '@/lib/queries'
import { fmtDate } from '@/lib/format'

export const Route = createFileRoute('/(main)/settings/exchanges')({
  head: () => ({ meta: [{ title: 'Exchange keys · crypz' }] }),
  component: ExchangeKeys,
})

function ExchangeKeys() {
  const queryClient = useQueryClient()
  const list = useQuery(connectionsQuery())
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: connectionsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: portfolioQuery().queryKey }),
    ])

  return (
    <>
      <PageHeader title="Exchange keys" />
      <main className="grid w-full gap-10 px-4 py-8 sm:px-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Connected</h2>
            <p className="text-sm text-muted-foreground">
              Keys are encrypted on the server the moment you save them and are never shown again.
            </p>
          </div>
          <div className="border border-border">
            {list.isPending ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : list.isError ? (
              <p className="p-4 text-sm text-down">{list.error.message}</p>
            ) : list.data.length ? (
              <ul>
                {list.data.map((c) => (
                  <ConnectionRow key={c.id} c={c} onRemoved={refresh} />
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No keys yet. Add your first one.</p>
            )}
          </div>
        </section>

        <AddKey onAdded={refresh} />
      </main>
    </>
  )
}

type Row = {
  id: string
  exchange: string
  label: string
  keyHint: string
  demo: boolean
  permissions: string[]
  lastUsedAt: string | null
  createdAt: string
}

function ConnectionRow({ c, onRemoved }: { c: Row; onRemoved: () => Promise<unknown> }) {
  const [confirm, setConfirm] = useState(false)
  const remove = useMutation({
    mutationFn: () => unwrap(api.connections[':id'].$delete({ param: { id: c.id } })),
    onSuccess: onRemoved,
  })
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-hairline px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          {c.label}
          {c.demo && <span className="label">demo</span>}
        </span>
        <span className="num text-xs text-muted-foreground">
          {c.exchange.toUpperCase()} · key …{c.keyHint} · {c.permissions.join(', ')} · added{' '}
          {fmtDate(Date.parse(c.createdAt))}
          {c.lastUsedAt && ` · used ${fmtDate(Date.parse(c.lastUsedAt))}`}
        </span>
        {remove.isError && <span className="text-xs text-down">{remove.error.message}</span>}
      </div>
      {confirm ? (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={remove.isPending}>
            Keep
          </Button>
          <Button variant="destructive" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending ? 'Removing…' : 'Remove key'}
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
          Remove
        </Button>
      )}
    </li>
  )
}

function AddKey({ onAdded }: { onAdded: () => Promise<unknown> }) {
  const add = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const f = new FormData(form)
      const text = (k: string) => String(f.get(k) ?? '')
      return unwrap(
        api.connections.$post({
          json: {
            exchange: 'okx',
            label: text('label') || undefined,
            apiKey: text('apiKey'),
            secret: text('secret'),
            passphrase: text('passphrase'),
            demo: f.get('demo') === 'on',
          },
        }),
      ).then(() => form.reset())
    },
    onSuccess: onAdded,
  })
  const secretProps = { autoComplete: 'off', spellCheck: false, required: true, className: 'num' } as const

  return (
    <section className="flex flex-col gap-5 border border-border p-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-medium">Add an OKX key</h2>
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-sm text-pretty text-muted-foreground">
          <li>
            In OKX, open{' '}
            <a
              href="https://www.okx.com/account/my-api"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-4"
            >
              API management <ArrowUpRight className="size-3" />
            </a>{' '}
            and create a key with <strong className="font-medium text-foreground">Read</strong> permission only.
          </li>
          <li>Bind it to the crypz server IP if OKX offers it.</li>
          <li>Paste the key, secret and passphrase below.</li>
        </ol>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate(e.currentTarget)
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="label">Label</Label>
          <Input id="label" name="label" placeholder="optional, e.g. Main account" maxLength={60} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="apiKey">API key</Label>
          <Input id="apiKey" name="apiKey" {...secretProps} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="secret">Secret key</Label>
          <Input id="secret" name="secret" type="password" {...secretProps} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="passphrase">Passphrase</Label>
          <Input id="passphrase" name="passphrase" type="password" {...secretProps} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="demo" className="size-4 accent-foreground" />
          Created for Demo Trading
        </label>
        {add.isError && (
          <p role="alert" className="text-sm text-pretty text-down">
            {add.error.message}
          </p>
        )}
        {add.isSuccess && <p className="text-sm text-up">Key connected. Your desk is loading it now.</p>}
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? 'Checking the key with OKX…' : 'Verify and save'}
        </Button>
        <p className="flex items-start gap-2 text-xs text-pretty text-muted-foreground">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          We ask OKX what the key may do and refuse it unless it is read-only, so crypz can never trade or withdraw.
        </p>
      </form>
    </section>
  )
}
