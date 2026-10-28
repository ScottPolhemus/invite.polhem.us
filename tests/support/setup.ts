import { createElement } from 'react'
import { afterAll, beforeEach, vi } from 'vitest'

import { FakeAtproto } from './fake-atproto'
import { world } from './world'

// ---- framework stand-ins: the pieces of Next that need a running server ----

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      world.cookies.has(name)
        ? { name, value: world.cookies.get(name)! }
        : undefined,
    set: (name: string, value: string) => void world.cookies.set(name, value),
    delete: (name: string) => void world.cookies.delete(name),
  }),
}))

vi.mock('next/cache', () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  refresh: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

// redirect() and notFound() work by throwing; these throw the same digests
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url};307;`,
    })
  },
  notFound: () => {
    throw Object.assign(new Error('NEXT_NOT_FOUND'), {
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    })
  },
  usePathname: () => world.pathname,
}))

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => {
    const { href, children, prefetch, ...rest } = props
    void prefetch
    return createElement('a', { href, ...rest }, children as never)
  },
}))

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}))

// ---- the atproto boundary: sign-in goes to a fake OAuth client ----

vi.mock('@/lib/atproto/oauth-client', async () => {
  const { fakeOAuth } = await import('./fake-oauth')
  return {
    PUBLIC_URL: 'http://127.0.0.1:3000',
    OAUTH_SCOPE: 'atproto',
    getOAuthClient: async () => fakeOAuth,
  }
})

// ---- the fake network, started before any app module reads its URLs ----

const network = new FakeAtproto()
await network.start()
world.network = network
process.env.PLC_URL = network.url
process.env.HANDLE_RESOLVER_URL = network.url

async function pool() {
  return (await import('@/lib/db/client')).pool
}

beforeEach(async () => {
  world.cookies.clear()
  world.oauthSessions.clear()
  world.pathname = '/'
  vi.clearAllMocks()
  await network.resetRepos()
  await (
    await pool()
  ).query('TRUNCATE record, ingest_cursor, oauth_state, oauth_session')
})

afterAll(async () => {
  await network.stop()
  await (await pool()).end()
})
