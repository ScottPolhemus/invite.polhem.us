# Pages and layout

## The home page

When signed in, the home page has two sections, each with its create link directly under the heading. **Your invitations** is described in [Working with invitations](invitations.md). **Your events** lists the events you've published plus the ones you've RSVP'd to (going or interested), each marked Hosting, Going, or Interested. Upcoming ones come first, soonest first; events that have ended (or have no start date) go in a collapsed "Past events" block, newest first, and that block includes past events you RSVP'd to as well as ones you hosted. Events you host have Edit and Delete next to them, and the event links don't prefetch, so a long list doesn't make the server render hundreds of event pages. Both lists come straight from your own repo and the events' authors' PDSes, and each shows at most 200 entries with a note about how many more exist, so an account that hosts thousands of events doesn't make the page heavy.

## Profile pages

`/profile/<actor>`, where the actor is a handle or a DID (a leading `@` and any capitalization are accepted), shows an account's name, handle, and DID, and lists its events the same way the home page does: the events it hosts plus the ones it has RSVP'd to (going or interested), upcoming first, with past ones in a collapsed block, each marked Hosting, Going, or Interested, and the same 200-row cap per list. It's public and read-only, with no Edit, Delete, or create links, even on your own profile. A handle that doesn't resolve, or a DID with no resolvable account, is a 404. RSVPs are public records in the account's repo, which is why anyone can see them here. The home page's list and the profile list are one shared component (`EventList`), so they stay consistent.

## The footer

While you're signed in, every page ends with a footer reading "Logged in as _name_ (@handle)" and a **Sign out** button (the handle is left out when you have no display name, since the name is then already the handle). It lives in the root layout, so it's on all pages including not-found, and signed-out visitors don't see it. Signing out returns you to the page you were on. The invitation page's own "signed in as someone else" notice keeps its separate sign-out link, since it explains why you can't RSVP there. The name-and-handle wording comes from one helper, `getAccountLabel`, which the invitation preview banner uses too.
