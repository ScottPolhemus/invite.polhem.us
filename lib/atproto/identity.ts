import 'server-only'

import { Client } from '@atproto/lex'
import { IdResolver, MemoryCache } from '@atproto/identity'

// ALLOW_LOCAL_NETWORK=true is for local development and the specs, which talk
// to services on localhost. By default every lookup here goes through
// protections against local and private addresses; this opts out of them.
const allowLocalNetwork = () => process.env.ALLOW_LOCAL_NETWORK === 'true'

// DID documents are cached in memory (stale-while-revalidate by the library).
// PLC_URL points did:plc lookups at another directory (default plc.directory).
const globalForIds = globalThis as unknown as { idResolver?: IdResolver }
const idResolver = (globalForIds.idResolver ??= new IdResolver({
  didCache: new MemoryCache(),
  plcUrl: process.env.PLC_URL || undefined,
  ...(allowLocalNetwork() && { fetch: globalThis.fetch }),
}))

/** Resolve a DID to its PDS endpoint via the DID document */
export async function resolvePds(did: string): Promise<string> {
  const { pds } = await idResolver.did.resolveAtprotoData(did)
  assertPublicHttps(pds)
  return pds
}

// DID documents are controlled by their owners, so a did:web document could
// point the PDS at an internal address; only follow public https endpoints
function assertPublicHttps(endpoint: string) {
  if (allowLocalNetwork()) return
  const url = new URL(endpoint)
  const host = url.hostname
  const internal =
    url.protocol !== 'https:' ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    !host.includes('.') ||
    /^[\d.]+$/.test(host) ||
    host.startsWith('[')
  if (internal) throw new Error(`Refusing non-public PDS endpoint: ${endpoint}`)
}

/**
 * Resolve a handle or DID to a DID. Handles go through DNS and HTTPS as usual,
 * or through an XRPC `resolveHandle` service when HANDLE_RESOLVER_URL is set
 * (the specs point it at the fake network).
 */
export async function resolveDid(handleOrDid: string): Promise<string> {
  if (handleOrDid.startsWith('did:')) return handleOrDid
  const service = process.env.HANDLE_RESOLVER_URL
  if (service) {
    const res = await fetch(
      `${service}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handleOrDid)}`
    )
    if (!res.ok) throw new Error(`Could not resolve handle ${handleOrDid}`)
    return ((await res.json()) as { did: string }).did
  }
  const did = await idResolver.handle.resolve(handleOrDid)
  if (!did) throw new Error(`Could not resolve handle ${handleOrDid}`)
  return did
}

/** The handle an account's DID document claims, if any */
export async function resolveHandle(did: string): Promise<string | undefined> {
  const { handle } = await idResolver.did.resolveAtprotoData(did)
  return handle === 'handle.invalid' ? undefined : handle
}

/** Unauthenticated client that reads public records straight from a repo's PDS */
export async function getPdsClient(did: string) {
  return new Client({ service: await resolvePds(did) })
}
