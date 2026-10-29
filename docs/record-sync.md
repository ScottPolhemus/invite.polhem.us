# Record sync

The user's PDS is the source of truth. Postgres holds a synced copy of **invitation records, and the RSVPs that answer them**, so the invitation links this app exists to hand out render from the database instead of depending on a PDS. Everything else is read from the network when needed and cached.

| Data                               | Where it comes from                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `us.polhem.invite.invitation`      | Synced to Postgres (the `record` table: `uri`, `did`, `collection`, `rkey`, `cid`, `value` as jsonb, `seq`)                                                                            |
| `community.lexicon.calendar.event` | Read from the author's PDS and cached for a few hours; never stored                                                                                                                    |
| `community.lexicon.calendar.rsvp`  | Written to the user's PDS. Stored in Postgres only when it carries an `invitation` reference to a known invitation (below); otherwise looked up on the PDS when needed (your own RSVP) |

## How invitations arrive

1. **Write-through.** When the app creates or edits an invitation, it stores the change immediately, so the link works before the network catches up. Deleting one removes it from your PDS and the database at once, and each of these expires the invitation's cached page data.
2. **Fetch on miss.** If an invitation page asks for one that isn't stored, it is fetched from the author's PDS and stored.
3. **Login backfill.** On sign-in, the user's invitations are pulled from their PDS.
4. **Jetstream ingest.** `/api/cron/ingest` (scheduled once a day in `vercel.json`, the most often Vercel's Hobby plan allows, and run once after each production deploy by a [GitHub workflow](configuration.md#after-a-deploy); bearer-protected by `CRON_SECRET`) runs one bounded cycle against [Jetstream](https://github.com/bluesky-social/jetstream) v2 filtered to the invitation collection: it reads the saved `seq` cursor, collects commits until a time or event budget is reached, applies them in order, and saves the new cursor. Creates and updates are upserted, deletes remove the row, and the cached page data (`record:<uri>` tags) for each changed invitation is expired.
   - With `JETSTREAM_API_TOKEN`, the cycle uses `replay()`: the archive from the cursor, handing off to the live tail without a gap, so downtime between cycles is recovered. A fresh database starts from the beginning of history.
   - Without a token it follows the live tail only. Invitations created between cycles before the first one sets a cursor can be missed.

## Which RSVPs are stored

An RSVP is kept in the `record` table only if it answers an invitation we know: its `invitation` reference points at a stored invitation, that invitation was sent to the account that made the RSVP, and the RSVP is about the same event as the invitation. Anything else (an RSVP with no invitation, a reference to an unknown invitation, or one that tries to attach itself to someone else's invitation) is never stored, so the table doesn't fill up with the network's RSVPs. The same rule applies on every path:

- **Write-through.** Responding through an invitation link, changing that response (from either page), and removing it update the database in the same request, so it's current before ingest catches up. A response given on the event page starts being stored once it's answered through the invitation, and keeps being stored after the event page changes it, since the record keeps its invitation.
- **Ingest.** The same Jetstream cycle also reads the RSVP collection and applies each RSVP by the rule above: a qualifying create or update is upserted, an update that no longer qualifies removes the stored copy, and a delete removes it. This is the consistency backstop for RSVPs made in other apps or missed by the write-through. The stream carries every RSVP in that collection, so the cycle's event budget bounds the work; the filter is applied here because Jetstream can't filter by field.
- **Deleting an invitation** (in the app, or seen on the stream) also removes the RSVPs stored against it, since they no longer answer a known invitation. The RSVP records themselves stay on their authors' PDSes.

The table has an index on the referenced invitation, so these lookups stay cheap. Run `yarn db:migrate` to add it.

## Consistency

- `record.seq` holds the Jetstream `seq` of the last event applied, and an upsert only overwrites a row when its `seq` is newer, so replays and overlapping cycles are idempotent and a stale event can't undo a newer one. Rows written by write-through or a PDS fetch have no `seq` and can be overwritten by any event.
- If the database and a PDS ever disagree, the PDS wins; re-fetching a record repairs the row.
