import { randomBytes } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { TID } from '@atproto/common-web'
import { Secp256k1Keypair } from '@atproto/crypto'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'

type StoredRecord = { cid: string; value: Record<string, unknown> }

export type FakeAccount = { did: string; handle: string; displayName?: string }

export type Write = {
  action: 'create' | 'put' | 'delete'
  repo: string
  collection: string
  rkey: string
  record?: Record<string, unknown>
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

async function makeCid(value: unknown) {
  const hash = await sha256.digest(
    new TextEncoder().encode(JSON.stringify(value))
  )
  // 0x71 is the dag-cbor codec, which is what a PDS uses for records
  return CID.createV1(0x71, hash).toString()
}

/**
 * A local stand-in for the parts of atproto the app talks to: a DID directory
 * (PLC), a handle resolver, and a PDS holding every account's repo in memory.
 *
 * It behaves like the real services where the app depends on it: records list
 * newest-first unless `reverse` is set, a repo only accepts writes from its own
 * account, and a missing record is a 400 RecordNotFound.
 */
export class FakeAtproto {
  url = ''
  accounts = new Map<string, FakeAccount & { doc: unknown }>()
  /** Every create, put, and delete the PDS accepted, in order */
  writes: Write[] = []
  /** Every request the server received, as "METHOD /path", for specs that count round trips */
  requests: string[] = []

  private repos = new Map<string, Map<string, Map<string, StoredRecord>>>()
  private server = http.createServer((req, res) => {
    this.handle(req, res).catch((err) => {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({ error: 'InternalServerError', message: String(err) })
      )
    })
  })

  async start() {
    await new Promise<void>((resolve) =>
      this.server.listen(0, '127.0.0.1', resolve)
    )
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  async stop() {
    this.server.closeAllConnections()
    await new Promise((resolve) => this.server.close(resolve))
  }

  /** Create an account (or return the existing one with this handle): its DID document (served by the directory) and, if it has a display name, its profile record */
  async addAccount(opts: { handle: string; displayName?: string }) {
    // One account per handle, so a spec can ask for "alice" in every test and
    // keep the same DID (the app caches DID documents for the whole file)
    const existing = [...this.accounts.values()].find(
      (a) => a.handle === opts.handle
    )
    if (existing) {
      existing.displayName = opts.displayName
      await this.seedProfile(existing)
      return existing as FakeAccount
    }
    const did = `did:plc:${Array.from(randomBytes(24), (b) => ALPHABET[b % 32]).join('')}`
    const key = await Secp256k1Keypair.create()
    const doc = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      alsoKnownAs: [`at://${opts.handle}`],
      verificationMethod: [
        {
          id: `${did}#atproto`,
          type: 'Multikey',
          controller: did,
          publicKeyMultibase: key.did().slice('did:key:'.length),
        },
      ],
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: this.url,
        },
      ],
    }
    const account = {
      did,
      handle: opts.handle,
      displayName: opts.displayName,
      doc,
    }
    this.accounts.set(did, account)
    await this.seedProfile(account)
    return account as FakeAccount
  }

  private async seedProfile(account: FakeAccount) {
    if (account.displayName)
      await this.put(account.did, 'app.bsky.actor.profile', 'self', {
        $type: 'app.bsky.actor.profile',
        displayName: account.displayName,
      })
  }

  /** Empty every repo (as between specs), keeping accounts and their profiles */
  async resetRepos() {
    this.repos.clear()
    this.writes = []
    this.requests = []
    for (const account of this.accounts.values())
      await this.seedProfile(account)
  }

  // ---- seeding and inspection, used directly by specs ----

  async put(
    repo: string,
    collection: string,
    rkey: string,
    value: Record<string, unknown>
  ) {
    const cid = await makeCid(value)
    this.collection(repo, collection).set(rkey, { cid, value })
    return { uri: `at://${repo}/${collection}/${rkey}`, cid, rkey }
  }

  /** Create a record with a fresh TID key, as the PDS does when none is given */
  async create(
    repo: string,
    collection: string,
    value: Record<string, unknown>
  ) {
    return this.put(repo, collection, TID.nextStr(), value)
  }

  get(repo: string, collection: string, rkey: string) {
    return this.repos.get(repo)?.get(collection)?.get(rkey)
  }

  /** Remove a record directly, as if its owner had deleted it elsewhere */
  delete(repo: string, collection: string, rkey: string) {
    this.repos.get(repo)?.get(collection)?.delete(rkey)
  }

  list(repo: string, collection: string) {
    return [...(this.repos.get(repo)?.get(collection) ?? [])].map(
      ([rkey, r]) => ({
        rkey,
        uri: `at://${repo}/${collection}/${rkey}`,
        ...r,
      })
    )
  }

  private collection(repo: string, collection: string) {
    if (!this.repos.has(repo)) this.repos.set(repo, new Map())
    const byCollection = this.repos.get(repo)!
    if (!byCollection.has(collection)) byCollection.set(collection, new Map())
    return byCollection.get(collection)!
  }

  // ---- HTTP ----

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', this.url)
    this.requests.push(`${req.method} ${url.pathname}`)
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const fail = (status: number, error: string, message: string) =>
      json(status, { error, message })

    // DID directory: GET /<did>
    if (req.method === 'GET' && url.pathname.startsWith('/did')) {
      const account = this.accounts.get(
        decodeURIComponent(url.pathname.slice(1))
      )
      return account
        ? json(200, account.doc)
        : fail(404, 'NotFound', 'DID not registered')
    }

    const q = url.searchParams
    if (url.pathname === '/xrpc/com.atproto.identity.resolveHandle') {
      const handle = q.get('handle')?.toLowerCase()
      const account = [...this.accounts.values()].find(
        (a) => a.handle.toLowerCase() === handle
      )
      return account
        ? json(200, { did: account.did })
        : fail(400, 'InvalidRequest', 'Unable to resolve handle')
    }

    if (url.pathname === '/xrpc/com.atproto.repo.getRecord') {
      const record = this.get(
        q.get('repo')!,
        q.get('collection')!,
        q.get('rkey')!
      )
      return record
        ? json(200, {
            uri: `at://${q.get('repo')}/${q.get('collection')}/${q.get('rkey')}`,
            cid: record.cid,
            value: record.value,
          })
        : fail(400, 'RecordNotFound', 'Could not locate record')
    }

    if (url.pathname === '/xrpc/com.atproto.repo.listRecords') {
      const repo = q.get('repo')!
      const collection = q.get('collection')!
      const limit = Math.min(Number(q.get('limit') ?? 50), 100)
      // Newest first by default, like a real PDS; `reverse` gives oldest first
      const ordered = this.list(repo, collection).sort((a, b) =>
        q.get('reverse') === 'true'
          ? a.rkey.localeCompare(b.rkey)
          : b.rkey.localeCompare(a.rkey)
      )
      const cursor = q.get('cursor')
      const start = cursor ? ordered.findIndex((r) => r.rkey === cursor) + 1 : 0
      const page = ordered.slice(start, start + limit)
      const more = start + limit < ordered.length
      return json(200, {
        records: page.map((r) => ({ uri: r.uri, cid: r.cid, value: r.value })),
        ...(more && { cursor: page[page.length - 1].rkey }),
      })
    }

    if (
      req.method === 'POST' &&
      url.pathname.startsWith('/xrpc/com.atproto.repo.')
    ) {
      const authed = /^Bearer test:(.+)$/.exec(
        String(req.headers.authorization ?? '')
      )?.[1]
      if (!authed)
        return fail(401, 'AuthenticationRequired', 'Authentication required')
      const body = JSON.parse(await readBody(req))
      if (body.repo !== authed)
        return fail(403, 'Forbidden', `${authed} cannot write to ${body.repo}`)

      const method = url.pathname.slice('/xrpc/com.atproto.repo.'.length)
      if (method === 'createRecord' || method === 'putRecord') {
        const rkey = body.rkey ?? TID.nextStr()
        const { uri, cid } = await this.put(
          body.repo,
          body.collection,
          rkey,
          body.record
        )
        this.writes.push({
          action: method === 'createRecord' ? 'create' : 'put',
          repo: body.repo,
          collection: body.collection,
          rkey,
          record: body.record,
        })
        return json(200, { uri, cid })
      }
      if (method === 'deleteRecord') {
        this.collection(body.repo, body.collection).delete(body.rkey)
        this.writes.push({
          action: 'delete',
          repo: body.repo,
          collection: body.collection,
          rkey: body.rkey,
        })
        return json(200, {})
      }
    }

    return fail(404, 'MethodNotImplemented', `${req.method} ${url.pathname}`)
  }
}

function readBody(req: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}
