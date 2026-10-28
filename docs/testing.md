# Testing

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
