import 'server-only'

import { Client } from '@atproto/lex'
import { IdResolver, MemoryCache } from '@atproto/identity'

// DID documents are cached in memory (stale-while-revalidate by the library)
const globalForIds = globalThis as unknown as { idResolver?: IdResolver }
const idResolver = (globalForIds.idResolver ??= new IdResolver({
  didCache: new MemoryCache(),
}))

/** Resolve a DID to its PDS endpoint via the DID document */
export async function resolvePds(did: string): Promise<string> {
  return (await idResolver.did.resolveAtprotoData(did)).pds
}

/** Resolve a handle or DID to a DID */
export async function resolveDid(handleOrDid: string): Promise<string> {
  if (handleOrDid.startsWith('did:')) return handleOrDid
  const did = await idResolver.handle.resolve(handleOrDid)
  if (!did) throw new Error(`Could not resolve handle ${handleOrDid}`)
  return did
}

/** Unauthenticated client that reads public records straight from a repo's PDS */
export async function getPdsClient(did: string) {
  return new Client({ service: await resolvePds(did) })
}
