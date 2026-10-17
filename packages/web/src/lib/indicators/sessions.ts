// The three trading sessions, each defined in its own city's wall-clock time so daylight saving moves it the way it
// moves the real market: London opens at 07:00 UTC in summer and 08:00 in winter, New York at 12:00 and 13:00, and
// Tokyo, with no daylight saving, at 00:00 all year. Converted through Intl, so no time-zone table ships with the app.

export type SessionId = 'asia' | 'london' | 'newYork'

export const SESSIONS: { id: SessionId; name: string; zone: string; open: number; close: number }[] = [
  { id: 'asia', name: 'Asia', zone: 'Asia/Tokyo', open: 9, close: 18 },
  { id: 'london', name: 'London', zone: 'Europe/London', open: 8, close: 17 },
  { id: 'newYork', name: 'New York', zone: 'America/New_York', open: 8, close: 17 },
]

export type SessionSpan = { id: SessionId; name: string; start: number; end: number }

const DAY = 86_400_000

const formats = new Map<string, Intl.DateTimeFormat>()
const formatFor = (zone: string) => {
  let f = formats.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    formats.set(zone, f)
  }
  return f
}

/** How far `zone`'s wall clock is ahead of UTC at instant `at`, in ms. */
function offset(zone: string, at: number) {
  const parts = formatFor(zone).formatToParts(at)
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return wall - (at - (at % 60_000))
}

/** The instant `zone`'s clock reads `hour`:00 on the calendar day that starts at UTC midnight `day`. */
function wallTime(day: number, hour: number, zone: string) {
  const guess = day + hour * 3_600_000
  // the second pass settles the hour around a daylight-saving change
  const first = guess - offset(zone, guess)
  return guess - offset(zone, first)
}

const cache = new Map<number, SessionSpan[]>()

/** Every session that overlaps [from, to], in start order. */
export function sessionsBetween(from: number, to: number): SessionSpan[] {
  const out: SessionSpan[] = []
  // a day either side catches Tokyo's session, which opens on the previous UTC day
  for (let day = from - (from % DAY) - DAY; day <= to + DAY; day += DAY) {
    let spans = cache.get(day)
    if (!spans) {
      spans = SESSIONS.map((s) => ({
        id: s.id,
        name: s.name,
        start: wallTime(day, s.open, s.zone),
        end: wallTime(day, s.close, s.zone),
      }))
      if (cache.size > 2000) cache.clear()
      cache.set(day, spans)
    }
    for (const s of spans) if (s.end > from && s.start <= to) out.push(s)
  }
  return out.sort((a, b) => a.start - b.start)
}

/** Today's hours of a session in the viewer's own clock, e.g. "15:00–00:00". */
export function localHours(id: SessionId, now = Date.now()) {
  const s = SESSIONS.find((x) => x.id === id)!
  const day = now - (now % DAY)
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(wallTime(day, s.open, s.zone))}–${fmt(wallTime(day, s.close, s.zone))}`
}
