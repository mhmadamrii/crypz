import { jeafx } from './jeafx'
import { sweepOrderBlock } from './sweep-order-block'
import type { Strategy } from './types'

// The strategies you can run on the replay chart. A fixed list for now.
export const STRATEGIES: Strategy[] = [jeafx, sweepOrderBlock]

export const strategyById = (id: string | undefined) => STRATEGIES.find((s) => s.id === id)

export { evaluate } from './evaluate'
export { MAX_FRAMES } from './types'
export type { Evaluation, Plan, Series, Strategy } from './types'
