import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveDid, resolveHandle, resolvePds } from '@/lib/atproto/identity'
import { getAccountLabel, getDisplayName, resolveRepo } from '@/lib/data'

import type { FakeAccount } from '../support/fake-atproto'
import { world } from '../support/world'

let alice: FakeAccount // has a display name
let dana: FakeAccount // has none

beforeEach(async () => {
  alice = await world.network.addAccount({
    handle: 'alice.test',
    displayName: 'Alice Anderson',
  })
  dana = await world.network.addAccount({ handle: 'dana.test' })
})

describe('Flow: opening a profile or a link that names an account', () => {
  it('accepts a handle or a DID, with an @ and in any capitalization', async () => {
    for (const actor of [
      'alice.test',
      '@alice.test',
      'ALICE.test',
      '%40Alice.TEST',
      alice.did,
    ])
      expect(await resolveRepo(actor)).toBe(alice.did)
  })

  it('finds nothing for a handle that does not exist', async () => {
    expect(await resolveRepo('nobody.test')).toBeNull()
  })

  it('has to find a real account for a DID, which the profile page checks next', async () => {
    const unknown = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'

    expect(await resolveRepo(unknown)).toBe(unknown) // a DID is taken as given…
    await expect(resolvePds(unknown)).rejects.toThrow() // …then must resolve to an account
    await expect(resolvePds(alice.did)).resolves.toBe(world.network.url)
  })
})

describe('How an account is named for people', () => {
  it('uses its display name', async () => {
    expect(await getDisplayName(alice.did)).toBe('Alice Anderson')
  })

  it('trims stray spaces from the display name', async () => {
    await world.network.put(alice.did, 'app.bsky.actor.profile', 'self', {
      displayName: '  Padded  ',
    })

    expect(await getDisplayName(alice.did)).toBe('Padded')
  })

  it('falls back to the handle when there is no display name, or a blank one', async () => {
    expect(await getDisplayName(dana.did)).toBe('@dana.test')

    await world.network.put(dana.did, 'app.bsky.actor.profile', 'self', {
      displayName: '   ',
    })
    expect(await getDisplayName(dana.did)).toBe('@dana.test')
  })

  it('falls back to the DID when the account cannot be found at all', async () => {
    const unknown = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'

    expect(await getDisplayName(unknown)).toBe(unknown)
  })

  it('adds the handle after a display name, but never repeats it', async () => {
    expect(await getAccountLabel(alice.did)).toEqual({
      name: 'Alice Anderson',
      handle: 'alice.test',
    })
    // no display name: the name is already "@dana.test", so there is no extra handle
    expect(await getAccountLabel(dana.did)).toEqual({
      name: '@dana.test',
      handle: undefined,
    })
  })

  it('shows just the DID for an account with neither', async () => {
    const unknown = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'

    expect(await getAccountLabel(unknown)).toEqual({
      name: unknown,
      handle: undefined,
    })
  })

  it('reads the handle from the account’s DID document', async () => {
    expect(await resolveHandle(alice.did)).toBe('alice.test')
    expect(await resolveDid('alice.test')).toBe(alice.did)
  })
})

describe('Following an account to its PDS safely', () => {
  it('refuses a PDS on a local or private address in a normal deployment', async () => {
    // the specs run with local addresses allowed; a real deployment does not
    vi.stubEnv('ALLOW_LOCAL_NETWORK', 'false')

    await expect(resolvePds(alice.did)).rejects.toThrow(
      /non-public PDS endpoint/
    )

    vi.unstubAllEnvs()
    await expect(resolvePds(alice.did)).resolves.toBe(world.network.url)
  })
})
