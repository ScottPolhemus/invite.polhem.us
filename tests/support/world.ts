import type { FakeAtproto } from './fake-atproto'

/** Per-file shared state: the fake network, the cookie jar, and which accounts hold a working login session */
export const world = {
  network: undefined as unknown as FakeAtproto,
  cookies: new Map<string, string>(),
  /** Accounts whose OAuth session can be restored. A cookie alone isn't enough. */
  oauthSessions: new Set<string>(),
  /** What `usePathname()` returns */
  pathname: '/',
}
