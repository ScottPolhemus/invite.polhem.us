import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const record = pgTable(
  'record',
  {
    uri: text('uri').primaryKey(),
    did: text('did').notNull(),
    collection: text('collection').notNull(),
    rkey: text('rkey').notNull(),
    cid: text('cid').notNull(),
    value: jsonb('value').notNull(),
    // Jetstream v2 seq; guards against applying stale events
    seq: bigint('seq', { mode: 'bigint' }),
    indexedAt: timestamp('indexed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('record_collection_did_idx').on(t.collection, t.did),
    index('record_recipient_idx').using(
      'btree',
      sql`(${t.value}->>'recipient')`
    ),
  ]
)

export const ingestCursor = pgTable('ingest_cursor', {
  id: text('id').primaryKey(),
  seq: bigint('seq', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const oauthState = pgTable('oauth_state', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const oauthSession = pgTable('oauth_session', {
  sub: text('sub').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
