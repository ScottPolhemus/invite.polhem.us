# Polhem.us Invite

Custom invitations for Atmosphere events

## How it works

You can create an invitation link addressed to another Atmosphere user for any event that's published to AT Protocol as a valid `community.lexicon.calendar.event` record. You can also create your own events in the app to invite people to.

Creating an invitation gives you a unique public URL which you can share with the recipient however you'd like. They'll open the link to see your customized invitation and respond directly from that page. Responses are published to the recipient's account as `community.lexicon.calendar.rsvp` records with an added reference to the invitation.

Invitations that you create are published to your own account as `us.polhem.invite.invitation` records.

## Technical design

### Serverless Next.js

The app uses the Next.js app framework and is written with Typescript on the frontend and backend. It is designed for a serverless Node hosting environment such as Vercel with a separate Postgres database for persisting auth sessions and AT Protocol records.

### OAuth

The app integrates OAuth for Atmosphere accounts using `@atproto/oauth-client-node`, with application logic for storing sessions and OAuth states in Postgres.

### AT Protocol records

This app does _not_ synchronize the entire network of `community.lexicon.calendar.event` and `community.lexicon.calendar.rsvp` records to its database over Jetstream. When these records are needed, they are fetched directly from the PDS and cached using Next.js Cache Components.

The app includes a lightweight synchronization strategy for persisting `us.polhem.invite.invitation` records and their corresponding RSVP responses. Invitations and RSVP records created within the app are written to the app's database as well as the user's PDS repo. A cron-based API endpoint is used to periodically backfill record changes from the network that may have occurred outside of the app.

## More documentation

Details on each feature, record sync, configuration and testing are in [docs](docs/README.md).
