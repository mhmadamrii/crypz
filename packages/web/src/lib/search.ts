/**
 * A search param as text. The router's URL decoder turns numeric-looking values into numbers
 * (`?equity=1000` → 1000), so accept both and hand back the string the user typed.
 */
export const searchText = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined)
