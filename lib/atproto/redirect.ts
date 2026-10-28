import { PUBLIC_URL } from './oauth-client'

/**
 * A same-origin path (with query) that's safe to send a user back to after
 * signing in or out; anything else, including other origins and
 * protocol-relative or backslash tricks, is rejected.
 */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined
  try {
    const base = new URL(PUBLIC_URL)
    const url = new URL(value, base)
    return url.origin === base.origin ? url.pathname + url.search : undefined
  } catch {
    return undefined
  }
}
