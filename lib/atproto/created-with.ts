/**
 * Stamped on events and RSVPs this app creates, as other atproto calendar apps
 * do, so a record says which app it came from. It's an extra property (the
 * calendar lexicons don't define it), set only when a record is first created:
 * edits carry along whatever the record already has, so a record made
 * elsewhere is never relabelled as ours.
 */
export const CREATED_WITH = 'https://invite.polhem.us'
