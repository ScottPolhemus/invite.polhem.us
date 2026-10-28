import { afterEach, describe, expect, it } from 'vitest'

import { formatLocal, formatUtc } from '@/lib/format-time'

const moment = '2026-11-05T18:30:00.000Z'
const originalTz = process.env.TZ
afterEach(() => {
  process.env.TZ = originalTz
})

describe('formatUtc', () => {
  it('is the same wherever the server runs', () => {
    process.env.TZ = 'Asia/Tokyo'
    expect(formatUtc(moment)).toBe('Nov 5, 2026, 6:30 PM UTC')
  })
})

describe('formatLocal', () => {
  it('shows the moment in the local timezone, naming it', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(formatLocal(moment)).toBe('Nov 5, 2026, 10:30 AM PST')
  })
})

describe.each([formatUtc, formatLocal])('%o', (format) => {
  it('shows an unreadable timestamp as written', () => {
    expect(format('soon')).toBe('soon')
  })
})
