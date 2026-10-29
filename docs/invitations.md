# Working with invitations

## Managing invitations

Signed-in users see **Your invitations** on the home page, listed from the database (newest first): the ones they created, each with Edit and Delete, and the ones addressed to them, marked "From _name_" and with no edit controls (only the author can change an invitation). Received invitations are the ones this app has stored: those ingested from the network, plus any opened here, so one sent before the app started ingesting may not appear until someone opens its link. The edit page (`/invitation/<did>/<rkey>/edit`, author only) changes the **message** only: the event and recipient are shown read-only, and to change either you delete the invitation and create a new one. The update action reads only the message from the form and carries every other field over untouched, so a hand-built request can't alter the event or recipient, and the record keeps its key so the shared link keeps working. Deleting asks for confirmation and removes the record from the author's PDS. Both actions write only to the signed-in user's own repo.

Each invitation in the list also shows the recipient's response (Going, Interested, or Not going) once they've RSVP'd to the event. It's read from the recipient's own public RSVP records, so it counts an RSVP made anywhere, not just through the invitation link, and it's cached for about a minute. When the recipient responds through this app, the cached response is expired right away. An invitation whose recipient hasn't RSVP'd shows nothing.

## Previewing your own invitation

When you're signed in as the account that created an invitation, its page starts with a banner: "This is a preview of your invitation to _name_ (@handle)." followed by a **Copy the link to share** link. The handle is left out when the recipient has no display name (the name is already the handle). Clicking the link copies the page's address (its origin and path, without any query or hash) to the clipboard and changes the text to "Link copied to clipboard" for about two seconds; if the browser refuses clipboard access it says "Couldn't copy the link" instead. Nobody else sees the banner, including the recipient.

## Inviting someone from an event page

Every event page has an **Invite someone to this event** section for signed-in visitors (anyone can invite someone to an event, as on the new-invitation form): a username field with the same handle suggestions, plus an optional message. It posts to the same action as the new-invitation page, so the result is identical and you land on the new invitation's shareable link. The action only differs in where it sends a mistake: a form that passes a `returnTo` path (the event page does) gets the error message back in place, scrolled to the section, instead of being sent to `/invitation/new`.

## Choosing an event for a new invitation

On the new-invitation form, the event list defaults to the events you've published plus the **upcoming events you've RSVP'd to** (going or interested; a "not going" RSVP is skipped), so you can invite someone to an event someone else is hosting. Both come straight from your own repo and the events' authors' PDSes: RSVPs are read from your RSVP records, newest 300 at most, and each event is fetched through the same cache as event pages. An RSVP'd event with no start date can't be called upcoming and is left out. Entering another account in "Events from" browses that account's events instead.

## The invitation message

The message on an invitation, and an event's description on event and invitation pages, is Markdown (headings, emphasis, lists, quotes, code and links). Web addresses written as plain text are linked too, and single line breaks are kept. Because anyone can write an invitation, it is rendered defensively: raw HTML in the text is shown as text, unsafe link addresses such as `javascript:` are not linked, links open in a new tab with `rel="noopener noreferrer nofollow"`, and images are left out so a message can't make the viewer's browser fetch from an address of the author's choosing.
