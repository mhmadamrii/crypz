import { createFileRoute, redirect } from '@tanstack/react-router'

// Old URL: Positions now lives under the exchange it reads.
export const Route = createFileRoute('/(main)/positions')({
  beforeLoad: () => {
    throw redirect({ to: '/$exchange/positions', params: { exchange: 'okx' }, replace: true })
  },
})
