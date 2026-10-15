import { QueryClient } from '@tanstack/react-query'
import { Link, createRouter, parseSearchWith, stringifySearchWith } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

// Search values stay plain strings (?entry=65000.5, not ?entry=%2265000.5%22). Only objects, arrays and
// quoted strings go through JSON, so typed input like "0.10" is never coerced to a number mid-edit.
const jsonOnly = (s: string) => {
  if (!/^[[{"]/.test(s)) throw new Error('plain')
  return JSON.parse(s)
}

function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className="num text-5xl">404</p>
        <p className="text-muted-foreground">No square here.</p>
        <Link to="/" className="text-sm underline">
          Back to crypz
        </Link>
      </div>
    </main>
  )
}

export function getRouter() {
  // One client per request on the server, one per tab in the browser.
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    parseSearch: parseSearchWith(jsonOnly),
    stringifySearch: stringifySearchWith(JSON.stringify, jsonOnly),
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
  })
  // Dehydrates loader-prefetched queries into the HTML and wraps the app in QueryClientProvider.
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
