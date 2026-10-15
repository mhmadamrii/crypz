import { Link, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

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
  return createRouter({ routeTree, scrollRestoration: true, defaultNotFoundComponent: NotFound })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
