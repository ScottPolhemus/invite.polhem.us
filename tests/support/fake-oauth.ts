import { world } from './world'

/**
 * A stand-in for the OAuth client (`@atproto/oauth-client-node`), which can't
 * run without a real authorization server. It keeps the same shape the app
 * uses: authorize() gives back a URL to send the user to, callback() turns the
 * returned parameters into a session, and restore() hands back something that
 * can make authenticated requests to the (fake) PDS, or throws if there's no
 * session for that account (expired, revoked, never signed in).
 */
export const fakeOAuth = {
  async authorize(
    handle: string,
    opts: { scope?: string; state?: string } = {}
  ) {
    const account = [...world.network.accounts.values()].find(
      (a) => a.handle === handle || a.did === handle
    )
    if (!account) throw new Error(`cannot resolve ${handle}`)
    const url = new URL('https://auth.example/authorize')
    url.searchParams.set('did', account.did)
    if (opts.scope) url.searchParams.set('scope', opts.scope)
    if (opts.state) url.searchParams.set('state', opts.state)
    return url
  },

  /** `params` are what the authorization server sent back: did (standing in for the code), state, or error */
  async callback(params: URLSearchParams) {
    const did = params.get('did')
    if (params.get('error') || !did) throw new Error('authorization denied')
    world.oauthSessions.add(did)
    return { session: { did }, state: params.get('state') }
  },

  async restore(did: string) {
    if (!world.oauthSessions.has(did)) throw new Error(`no session for ${did}`)
    return {
      did,
      fetchHandler: (path: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers)
        headers.set('authorization', `Bearer test:${did}`)
        return fetch(new URL(path, world.network.url), { ...init, headers })
      },
    }
  },

  async revoke(did: string) {
    world.oauthSessions.delete(did)
  },
}
