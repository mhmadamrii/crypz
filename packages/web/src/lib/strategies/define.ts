import type { Side } from '@/lib/indicators/bias'
import type { Check, Input, Strategy } from './types'

export type Rule<C> = { id: string; label: string; hint: string; check: (c: C) => Check }

/**
 * A strategy from its rules. `context` reads the candles once into whatever the rules share (it must include the
 * `side` the bias points); it returns null while there is not enough to read, and every rule then waits.
 */
export function defineStrategy<C extends { side: Side | null }>(def: {
  id: string
  name: string
  summary: string
  frames: Strategy['frames']
  settings: string
  context: (input: Input) => C | null
  rules: Rule<C>[]
}): Strategy {
  return {
    id: def.id,
    name: def.name,
    summary: def.summary,
    frames: def.frames,
    settings: def.settings,
    rules: def.rules.map(({ id, label, hint }) => ({ id, label, hint })),
    run: (input) => {
      const c = def.context(input)
      return {
        side: c?.side ?? null,
        results: def.rules.map((r) => ({
          id: r.id,
          label: r.label,
          ...(c ? r.check(c) : { met: false, detail: 'Waiting for candles' }),
        })),
      }
    },
  }
}
