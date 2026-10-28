import 'server-only'

import {
  NodeOAuthClient,
  JoseKey,
  OAuthClientMetadataInput,
} from '@atproto/oauth-client-node'

import { COLLECTIONS } from './collections'
import { requestLock, sessionStore, stateStore } from './oauth-stores'

export const PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://127.0.0.1:3000'

export const OAUTH_SCOPE = [
  'atproto',
  ...COLLECTIONS.map((c) => `repo:${c}`),
].join(' ')

const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(
  PUBLIC_URL
)

const globalForOAuth = globalThis as unknown as {
  oauthClient?: Promise<NodeOAuthClient>
}

async function createClient() {
  const redirectUri = `${PUBLIC_URL}/oauth/callback`
  const baseMetadata: Pick<
    OAuthClientMetadataInput,
    | 'client_name'
    | 'redirect_uris'
    | 'scope'
    | 'grant_types'
    | 'response_types'
    | 'application_type'
    | 'dpop_bound_access_tokens'
  > = {
    client_name: 'Polhem.us Invite',
    redirect_uris: [redirectUri],
    scope: OAUTH_SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    application_type: 'web',
    dpop_bound_access_tokens: true,
  }

  if (isLoopback) {
    // Public loopback client: client metadata is encoded in the client_id
    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      scope: OAUTH_SCOPE,
    })
    return new NodeOAuthClient({
      clientMetadata: {
        ...baseMetadata,
        client_id: `http://localhost?${params}`,
        token_endpoint_auth_method: 'none',
      },
      stateStore,
      sessionStore,
      requestLock,
    })
  }

  const privateJwk = process.env.OAUTH_PRIVATE_JWK
  if (!privateJwk)
    throw new Error('OAUTH_PRIVATE_JWK is required in production')

  return new NodeOAuthClient({
    clientMetadata: {
      ...baseMetadata,
      client_id: `${PUBLIC_URL}/oauth/client-metadata.json`,
      client_uri: PUBLIC_URL,
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      jwks_uri: `${PUBLIC_URL}/oauth/jwks.json`,
    },
    keyset: [await JoseKey.fromImportable(privateJwk, 'key-1')],
    stateStore,
    sessionStore,
    requestLock,
  })
}

export function getOAuthClient() {
  return (globalForOAuth.oauthClient ??= createClient())
}
