import { describe, expect, it } from 'vitest'

import {
  getPdsClient,
  resolveDid,
  resolveHandle,
  resolvePds,
} from '@/lib/atproto/identity'
import { getClient, getSessionDid } from '@/lib/atproto/session'
import { db } from '@/lib/db/client'
import { record } from '@/lib/db/schema'

import { signIn, signInWithExpiredSession } from './support/helpers'
import { world } from './support/world'

// These check the test harness itself: the fake network and sign-in behave
// like the real services in the ways the flow specs depend on.

describe('the fake network', () => {
  it('resolves a handle and a DID the way the app does', async () => {
    const alice = await world.network.addAccount({ handle: 'alice.test' })

    expect(await resolveDid('alice.test')).toBe(alice.did)
    expect(await resolveDid(alice.did)).toBe(alice.did)
    expect(await resolveHandle(alice.did)).toBe('alice.test')
    expect(await resolvePds(alice.did)).toBe(world.network.url)
    await expect(resolveDid('nobody.test')).rejects.toThrow()
  })

  it('lists records newest first by default, and oldest first with reverse', async () => {
    const alice = await world.network.addAccount({ handle: 'alice.test' })
    for (const rkey of ['3aaaaaaaaaaaa', '3bbbbbbbbbbbb', '3cccccccccccc'])
      await world.network.put(alice.did, 'x.y.z', rkey, { n: rkey })

    const client = await getPdsClient(alice.did)
    const newestFirst = await client.listRecords('x.y.z', {
      repo: alice.did as never,
    })
    const oldestFirst = await client.listRecords('x.y.z', {
      repo: alice.did as never,
      reverse: true,
    })

    expect(newestFirst.body.records.map((r) => r.uri.split('/').pop())).toEqual(
      ['3cccccccccccc', '3bbbbbbbbbbbb', '3aaaaaaaaaaaa']
    )
    expect(oldestFirst.body.records.map((r) => r.uri.split('/').pop())).toEqual(
      ['3aaaaaaaaaaaa', '3bbbbbbbbbbbb', '3cccccccccccc']
    )
  })

  it('pages through records with a cursor', async () => {
    const alice = await world.network.addAccount({ handle: 'alice.test' })
    for (let i = 0; i < 5; i++)
      await world.network.create(alice.did, 'x.y.z', { i })

    const client = await getPdsClient(alice.did)
    const first = await client.listRecords('x.y.z', {
      repo: alice.did as never,
      limit: 2,
    })
    const second = await client.listRecords('x.y.z', {
      repo: alice.did as never,
      limit: 2,
      cursor: first.body.cursor,
    })
    const third = await client.listRecords('x.y.z', {
      repo: alice.did as never,
      limit: 2,
      cursor: second.body.cursor,
    })

    expect([first, second, third].map((p) => p.body.records.length)).toEqual([
      2, 2, 1,
    ])
    expect(third.body.cursor).toBeUndefined()
  })
})

describe('signing in', () => {
  it('needs both a session cookie and a restorable OAuth session to write', async () => {
    const alice = await world.network.addAccount({ handle: 'alice.test' })

    expect(await getSessionDid()).toBeNull()
    expect(await getClient()).toBeNull()

    await signInWithExpiredSession(alice.did)
    expect(await getSessionDid()).toBe(alice.did)
    expect(await getClient()).toBeNull() // cookie only: an expired sign-in

    await signIn(alice.did)
    expect((await getClient())?.did).toBe(alice.did)
  })

  it('lets an account write only to its own repo, like a real PDS', async () => {
    const alice = await world.network.addAccount({ handle: 'alice.test' })
    const bob = await world.network.addAccount({ handle: 'bob.test' })
    await signIn(alice.did)
    const client = (await getClient())!

    await client.createRecord(
      { $type: 'x.y.z', hello: 'world' } as never,
      undefined,
      { repo: alice.did as never } as never
    )
    expect(world.network.list(alice.did, 'x.y.z')).toHaveLength(1)

    await expect(
      client.createRecord({ $type: 'x.y.z' } as never, undefined, {
        repo: bob.did as never,
      } as never)
    ).rejects.toThrow()
    expect(world.network.list(bob.did, 'x.y.z')).toHaveLength(0)
  })
})

describe('the test database', () => {
  it('accepts a row…', async () => {
    await db.insert(record).values({
      uri: 'at://did:plc:a/us.polhem.invite.invitation/3aaaaaaaaaaaa',
      did: 'did:plc:a',
      collection: 'us.polhem.invite.invitation',
      rkey: '3aaaaaaaaaaaa',
      cid: 'bafytest',
      value: {},
    })
    expect(await db.select().from(record)).toHaveLength(1)
  })

  it('…and starts the next spec empty again', async () => {
    expect(await db.select().from(record)).toHaveLength(0)
  })
})
