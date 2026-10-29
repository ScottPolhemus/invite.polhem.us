import { afterEach, describe, expect, it } from 'vitest'

import {
  formatLocal,
  formatLocalDate,
  formatUtc,
  formatUtcDate,
} from '@/lib/format-time'

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

describe('server and browser agree', () => {
  it('joins date and time with a comma and uses only plain spaces, whatever the locale data does', () => {
    const real = Date.prototype.toLocaleTimeString
    // what newer ICU data does: a narrow no-break space before AM/PM
    Date.prototype.toLocaleTimeString = function (
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ) {
      return real.call(this, locales, options).replace(' PM', '\u202fPM')
    }
    try {
      expect(formatUtc(moment)).toBe('Nov 5, 2026, 6:30 PM UTC')
    } finally {
      Date.prototype.toLocaleTimeString = real
    }
  })
})

describe('formatLocal', () => {
  it('shows the moment in the local timezone, naming it', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(formatLocal(moment)).toBe('Nov 5, 2026, 10:30 AM PST')
  })
})

describe('formatUtcDate', () => {
  it('is the UTC calendar date, wherever the server runs', () => {
    process.env.TZ = 'Pacific/Auckland'
    expect(formatUtcDate('2026-11-05T23:30:00.000Z')).toBe('Nov 5, 2026')
  })
})

describe('formatLocalDate', () => {
  it("is the visitor's calendar date, which can differ from the UTC one", () => {
    // 6:30 PM on Nov 5 in Los Angeles is already Nov 6 in UTC
    const evening = '2026-11-06T02:30:00.000Z'
    process.env.TZ = 'America/Los_Angeles'
    expect(formatLocalDate(evening)).toBe('Nov 5, 2026')
    expect(formatUtcDate(evening)).toBe('Nov 6, 2026')
  })
})

describe.each([formatUtc, formatLocal, formatUtcDate, formatLocalDate])(
  '%o',
  (format) => {
    it('shows an unreadable timestamp as written', () => {
      expect(format('soon')).toBe('soon')
    })
  }
)
