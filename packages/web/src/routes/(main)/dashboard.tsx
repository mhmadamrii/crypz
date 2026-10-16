import { createFileRoute, redirect } from '@tanstack/react-router'

// Old URL: the Overview now lives under the exchange it reads.
export const Route = createFileRoute('/(main)/dashboard')({
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/$exchange/overview', params: { exchange: 'okx' }, search, replace: true })
  },
})
