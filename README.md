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

The user's PDS is the source of truth. Postgres holds a synced copy of **invitation records only**, so the invitation links this app exists to hand out render from the database instead of depending on a PDS. Everything else is read from the network when needed and cached.

| Data                               | Where it comes from                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `us.polhem.invite.invitation`      | Synced to Postgres (the `record` table: `uri`, `did`, `collection`, `rkey`, `cid`, `value` as jsonb, `seq`) |
| `community.lexicon.calendar.event` | Read from the author's PDS and cached for a few hours; never stored                                         |
| `community.lexicon.calendar.rsvp`  | Written to the user's PDS; looked up there when needed (your own RSVP); never stored                        |

### How invitations arrive

1. **Write-through.** When the app creates or edits an invitation, it stores the change immediately, so the link works before the network catches up. Deleting one removes it from your PDS and the database at once, and each of these expires the invitation's cached page data.
2. **Fetch on miss.** If an invitation page asks for one that isn't stored, it is fetched from the author's PDS and stored.
3. **Login backfill.** On sign-in, the user's invitations are pulled from their PDS.
4. **Jetstream ingest.** `/api/cron/ingest` (scheduled every minute in `vercel.json`, bearer-protected by `CRON_SECRET`) runs one bounded cycle against [Jetstream](https://github.com/bluesky-social/jetstream) v2 filtered to the invitation collection: it reads the saved `seq` cursor, collects commits until a time or event budget is reached, applies them in order, and saves the new cursor. Creates and updates are upserted, deletes remove the row, and the cached page data (`record:<uri>` tags) for each changed invitation is expired.
   - With `JETSTREAM_API_TOKEN`, the cycle uses `replay()`: the archive from the cursor, handing off to the live tail without a gap, so downtime between cycles is recovered. A fresh database starts from the beginning of history.
   - Without a token it follows the live tail only. Invitations created between cycles before the first one sets a cursor can be missed.

### The footer

While you're signed in, every page ends with a footer reading "Logged in as _name_ (@handle)" and a **Sign out** button (the handle is left out when you have no display name, since the name is then already the handle). It lives in the root layout, so it's on all pages including not-found, and signed-out visitors don't see it. Signing out returns you to the page you were on. The invitation page's own "signed in as someone else" notice keeps its separate sign-out link, since it explains why you can't RSVP there. The name-and-handle wording comes from one helper, `getAccountLabel`, which the invitation preview banner uses too.

### The home page

When signed in, the home page has two sections, each with its create link directly under the heading. **Your invitations** is described below. **Your events** lists the events you've published plus the ones you've RSVP'd to (going or interested), each marked Hosting, Going, or Interested. Upcoming ones come first, soonest first; events that have ended (or have no start date) go in a collapsed "Past events" block, newest first, and that block includes past events you RSVP'd to as well as ones you hosted. Events you host have Edit and Delete next to them, and the event links don't prefetch, so a long list doesn't make the server render hundreds of event pages. Both lists come straight from your own repo and the events' authors' PDSes, and each shows at most 200 entries with a note about how many more exist, so an account that hosts thousands of events doesn't make the page heavy.

### Managing invitations

Signed-in users see **Your invitations** on the home page, listed from the database (newest first), each with Edit and Delete. The edit page (`/invitation/<did>/<rkey>/edit`, author only) changes the **message** only: the event and recipient are shown read-only, and to change either you delete the invitation and create a new one. The update action reads only the message from the form and carries every other field over untouched, so a hand-built request can't alter the event or recipient, and the record keeps its key so the shared link keeps working. Deleting asks for confirmation and removes the record from the author's PDS. Both actions write only to the signed-in user's own repo.

Each invitation in the list also shows the recipient's response (Going, Interested, or Not going) once they've RSVP'd to the event. It's read from the recipient's own public RSVP records, so it counts an RSVP made anywhere, not just through the invitation link, and it's cached for about a minute. When the recipient responds through this app, the cached response is expired right away. An invitation whose recipient hasn't RSVP'd shows nothing.

### Previewing your own invitation

When you're signed in as the account that created an invitation, its page starts with a banner: "This is a preview of your invitation to _name_ (@handle)." followed by a **Copy the link to share** link. The handle is left out when the recipient has no display name (the name is already the handle). Clicking the link copies the page's address (its origin and path, without any query or hash) to the clipboard and changes the text to "Link copied to clipboard" for about two seconds; if the browser refuses clipboard access it says "Couldn't copy the link" instead. Nobody else sees the banner, including the recipient.

### Inviting someone from an event page

Every event page has an **Invite someone to this event** section for signed-in visitors (anyone can invite someone to an event, as on the new-invitation form): a username field with the same handle suggestions, plus an optional message. It posts to the same action as the new-invitation page, so the result is identical and you land on the new invitation's shareable link. The action only differs in where it sends a mistake: a form that passes a `returnTo` path (the event page does) gets the error message back in place, scrolled to the section, instead of being sent to `/invitation/new`.

### Creating events

`/events/new` (linked from the home page and the new-invitation form) publishes a `community.lexicon.calendar.event` record to the signed-in user's own repo: name, start (required), end, attendance (in person, virtual, or hybrid), description, a link, and an optional address. The date fields are converted to UTC timestamps in the browser, where the timezone is known, and everything is validated again on the server: an end before the start, a link that isn't `http(s)`, or an address without a country code is rejected. Events aren't stored in the database, so after creating one you're sent to its page, which reads it from your PDS. Like other atproto calendar apps, new events carry a `createdWith: "https://invite.polhem.us"` property saying which app made them (see below).

### Profile pages

`/profile/<actor>`, where the actor is a handle or a DID (a leading `@` and any capitalization are accepted), shows an account's name, handle, and DID, and lists its events the same way the home page does: the events it hosts plus the ones it has RSVP'd to (going or interested), upcoming first, with past ones in a collapsed block, each marked Hosting, Going, or Interested, and the same 200-row cap per list. It's public and read-only, with no Edit, Delete, or create links, even on your own profile. A handle that doesn't resolve, or a DID with no resolvable account, is a 404. RSVPs are public records in the account's repo, which is why anyone can see them here. The home page's list and the profile list are one shared component (`EventList`), so they stay consistent.

### Marking records as made here

Events and RSVPs this app creates get `createdWith: "https://invite.polhem.us"` (the constant lives in `lib/atproto/created-with.ts`). It's an extra property, since the calendar lexicons don't define it; the client doesn't validate request bodies by default, so it's sent as is. It's set only when a record is **first created**, whether the RSVP was made from an event page or through an invitation link. Editing an event, or changing an existing RSVP's response, never adds or changes it: those writes start from the record as it is now (the typed client returns fields the lexicon doesn't declare), so a record made by another app keeps its own `createdWith`, and one of ours keeps ours. Invitations aren't stamped, since they're already specific to this app.

### Editing and deleting events

An event's author sees **Edit event** on its page, and **Edit** and **Delete** beside it in Your events. The edit page (`/events/<did>/<rkey>/edit`, author only) shows the same form as creating one, with the status (scheduled, planned, rescheduled, postponed, cancelled) included, and **every field can change**. It updates the record in place under the same record key, so existing links, invitations, and RSVPs keep pointing at it. Real events carry more than the form models, so the update merges rather than overwrites: the form's link replaces only the first link and its address only the first address (other links and locations such as geo or H3 coordinates stay), every other field (media, timezone, and anything other apps added) is carried over, and an unchanged start or end time keeps its original string. Two consequences to know about: `facets` (byte offsets into the description) are dropped if the description text changes, since stale offsets would mislink text, and a changed address leaves any stored coordinates as they were. Deleting asks for confirmation, says how many of your invitations point at the event, and removes the record from your PDS; invitations and RSVPs that other people made can't be changed, so an invitation to a deleted event shows "Event unavailable".

### Choosing an event for a new invitation

On the new-invitation form, the event list defaults to the events you've published plus the **upcoming events you've RSVP'd to** (going or interested; a "not going" RSVP is skipped), so you can invite someone to an event someone else is hosting. Both come straight from your own repo and the events' authors' PDSes: RSVPs are read from your RSVP records, newest 300 at most, and each event is fetched through the same cache as event pages. An RSVP'd event with no start date can't be called upcoming and is left out. Entering another account in "Events from" browses that account's events instead.

### Events and RSVPs

- **Events** are fetched from their author's PDS by the page that needs them and cached with `'use cache'` (tagged `record:<uri>`, a few hours). Nothing syncs them, so an edit shows up when the cache expires.
- **RSVP buttons** are the same component on event pages and invitation pages (`RsvpButtons`): Going, Interested, and Not going. The signed-in account's current response is filled, checked, and `aria-pressed`, the other two are outlined, and once there is a response a **Remove your RSVP** link deletes the record from the account's PDS. On an invitation page only the invited account sees them (anyone else gets the sign-in or "not you?" options), and the RSVP records which invitation it answers; on an event page any account with a **working login session** sees them and no invitation is recorded. The event page checks that the session can actually be restored, not just that a signed-in cookie exists, because choosing a response writes to the account's PDS and would otherwise look live while doing nothing; with an expired or revoked session it shows a short note ("Your sign-in has expired") and the sign-in form instead of leaving only a Sign out link, and signed-out visitors get the same form. Both return you to the event page after signing in (the new-invitation page does the same). The invitation page only checks the cookie.
- **The current response** is read fresh from the account's own public RSVP records on every load (not through the one-minute cache the invitations list uses), so the buttons match the record exactly, including an RSVP made in another app. Choosing a response writes straight to the account's PDS, updating an existing RSVP in place rather than adding another.

### Consistency

- `record.seq` holds the Jetstream `seq` of the last event applied, and an upsert only overwrites a row when its `seq` is newer, so replays and overlapping cycles are idempotent and a stale event can't undo a newer one. Rows written by write-through or a PDS fetch have no `seq` and can be overwritten by any event.
- If the database and a PDS ever disagree, the PDS wins; re-fetching a record repairs the row.

### Configuration

| Variable              | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`        | Postgres connection (`yarn db:up` starts a local container)          |
| `CRON_SECRET`         | Bearer token required by `/api/cron/ingest`                          |
| `JETSTREAM_URL`       | Jetstream v2 host (default `https://jetstream.us-east.bsky.network`) |
| `JETSTREAM_API_TOKEN` | Optional. Enables replay from the archive                            |

## Testing

```bash
yarn db:up   # the specs need Postgres
yarn test    # or yarn test:watch
```

The specs cover each user flow: signing in and out, creating, editing and deleting events and invitations, RSVPing (from an event or an invitation), the lists on the home and profile pages, the invitation page for each kind of visitor, and the record sync. They call the server actions, route handlers and components directly, with no browser.

Nothing leaves the machine. `tests/support/fake-atproto.ts` is a small local stand-in for the network: a DID directory, a handle resolver and a PDS (list order, paging and the own-repo write rule behave like a real one), and `fake-oauth.ts` replaces the OAuth client. The app reaches them through three optional settings, which the specs set in `vitest.config.ts` and `tests/support/setup.ts`:

- `PLC_URL`: where `did:plc` documents are looked up (default plc.directory)
- `HANDLE_RESOLVER_URL`: an XRPC service that resolves handles (default DNS and HTTPS)
- `ALLOW_LOCAL_NETWORK=true`: lets lookups reach localhost and plain http, which the app otherwise refuses

The specs use their own `invite_test` database on the same Postgres, created and migrated on the first run and emptied before every test, so your development data is untouched.
