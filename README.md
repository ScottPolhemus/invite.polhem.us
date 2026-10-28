# invite.polhem.us: Invitations for Atmosphere events

## Routes

### /event/[repo]/[rkey]

Event pages are available for any AT Protocol event that is published as a valid `community.lexicon.calendar.event` record. Any user can RSVP to an event from its page, or sign in to create a recipient-specific invitation.

## Invitations

```
/invitation/[repo]/[slug]
```

Users can create an invitation requesting that a specific user RSVP to a given event. Invitations are published as `us.polhem.invite.invitation` records with public fields indicating the event and intended recipient.

RSVP records created by an invited user through the received invitation link contain an additional `invitation` property pointing back to the invitation record.

## Record sync

The user's PDS is the source of truth. Postgres holds a synced copy of only the records the app needs, so pages render from the database instead of fetching from a PDS on every request. Everything is stored in a single generic `record` table (`uri`, `did`, `collection`, `rkey`, `cid`, `value` as jsonb, `seq`), with a `tracked_event` table listing the events we follow.

### What gets stored

| Record                             | Stored when                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `us.polhem.invite.invitation`      | Always                                                                          |
| `community.lexicon.calendar.event` | An invitation points at it, or its event page has been loaded (it is _tracked_) |
| `community.lexicon.calendar.rsvp`  | It points back at a stored invitation, or its subject is a tracked event        |

Everything else on the network is ignored. The policy lives in `shouldStore` in `lib/atproto/records.ts`, and every sync path below goes through it.

### How records arrive

1. **Write-through.** When the app creates, updates, or deletes a record on a user's behalf, it applies the same change to the database immediately, so the result is visible before the network catches up.
2. **Fetch on miss.** If a page asks for a record that isn't stored, it is fetched from the author's PDS and stored if the policy allows. Loading an event page starts tracking that event, so later edits and deletes are followed.
3. **Login backfill.** On sign-in, the user's invitations and their RSVPs that match the policy are pulled from their PDS.
4. **Jetstream ingest.** `/api/cron/ingest` (scheduled every minute in `vercel.json`, bearer-protected by `CRON_SECRET`) runs one bounded cycle against [Jetstream](https://github.com/bluesky-social/jetstream) v2: it reads the saved `seq` cursor, collects commits for the three collections until a time or event budget is reached, applies those that pass the policy in order, and saves the new cursor. Deletes remove the row.
   - With `JETSTREAM_API_TOKEN`, the cycle uses `replay()`: the archive from the cursor, handing off to the live tail without a gap, so downtime between cycles is recovered. A fresh database starts from the beginning of history.
   - Without a token it follows the live tail only. Events that occur between cycles before the first matching event sets a cursor can be missed.
5. **Event RSVP history.** RSVPs made before an event was tracked are backfilled for each tracked event with no `backfilled_at`. One scan of Jetstream's RSVP archive serves all pending events at once. If there is no token, or the scan doesn't finish within its budget, the app falls back to the [Constellation](https://constellation.microcosm.blue) backlink index and fetches each RSVP from its PDS.
6. **Invitation to event.** Storing an invitation also fetches the event it points at and tracks it, so the event and its future RSVPs are synced.

### Consistency

- `record.seq` holds the Jetstream `seq` of the last event applied, and an upsert only overwrites a row when its `seq` is newer, so replays and overlapping cycles are idempotent and a stale event can't undo a newer one. Rows written by write-through or a PDS fetch have no `seq` and can be overwritten by any event.
- Ingest expires the cached page data (`record:<uri>` tags) for every record it changes.
- If the database and a PDS ever disagree, the PDS wins; re-fetching a record repairs the row.

### Configuration

| Variable              | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`        | Postgres connection (`yarn db:up` starts a local container)          |
| `CRON_SECRET`         | Bearer token required by `/api/cron/ingest`                          |
| `JETSTREAM_URL`       | Jetstream v2 host (default `https://jetstream.us-east.bsky.network`) |
| `JETSTREAM_API_TOKEN` | Optional. Enables replay and archive scans                           |
| `CONSTELLATION_URL`   | Backlink index used as the RSVP history fallback                     |

### Limitations

- RSVPs to events that aren't tracked are not stored, and RSVPs to tracked events that predate tracking depend on the backfill in step 5.
- `yarn ingest` (a local ingest loop) currently fails to start because of a module-resolution error; call the cron route on a timer instead.
