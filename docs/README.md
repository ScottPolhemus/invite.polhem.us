# Documentation

- [Routes and invitations](routes.md): the pages and what an invitation is
- [Working with invitations](invitations.md): managing, previewing and creating them
- [Events](events.md): creating, editing and deleting events, and how events and RSVPs are read
- [Pages and layout](pages.md): the home page, profile pages and the footer
- [Record sync](record-sync.md): what is stored in Postgres, and how it stays in step with the network
- [Configuration](configuration.md): environment variables
- [Testing](testing.md): running the specs and how they fake the network

## Code layout

The AT Protocol code is in `lib/atproto`, one file per domain:

- `records.ts`: collection names, `createdWith`, and the stored-record helpers (upsert, delete, fetch from a PDS)
- `events.ts`: reading and validating the event form, merging an edit into an existing record, and listing events
- `invitations.ts`: reading the invitation form, and finding, listing and deleting stored invitations
- `rsvps.ts`: finding an account's RSVP, response statuses, and storing RSVPs that answer a known invitation
- `sync.ts`: the login backfill and the ingest cycle
- `jetstream.ts`: the Jetstream stream reader (separate so the specs can stand in for the network)
- `oauth-client.ts`: the OAuth client and its Postgres stores (separate so the specs can swap in a fake)
- `session.ts`: the session cookie, the signed-in client, and safe redirect paths
- `identity.ts`: handle, DID and PDS resolution

The React components in `app/_components` are grouped the same way: `auth` (sign-in form, footer, sign-out), `events` (event form, details, lists), `invitations` (invitation form and banner, event picker), `rsvps` (response buttons and control), and `ui` (small shared pieces such as the page header and handle typeahead).
