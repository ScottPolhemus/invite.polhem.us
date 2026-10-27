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
