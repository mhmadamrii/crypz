import { sweepOrderBlock } from './sweep-order-block'
import type { Strategy } from './types'

// The strategies you can run on the replay chart. A fixed list for now.
export const STRATEGIES: Strategy[] = [sweepOrderBlock]

export const strategyById = (id: string | undefined) => STRATEGIES.find((s) => s.id === id)

export { evaluate } from './evaluate'
export type { Evaluation, Plan, Rule, Strategy } from './types'
