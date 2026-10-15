import { createServerFn } from '@tanstack/react-start'
import { loadPortfolio } from '@crypz/exchanges/server'

export const getPortfolio = createServerFn({ method: 'GET' }).handler(() => loadPortfolio())
