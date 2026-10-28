import 'server-only'

import { l } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'

import { EVENT } from './collections'
import { resolveDid } from './identity'
import { fetchRecord } from './records'

export type InvitationInput =
  | { error: 'recipient' | 'event' }
  | {
      subject: { uri: l.AtUriString; cid: string }
      recipient: l.DidString
      markdown: string
    }

/**
 * Validates the invitation form shared by create and edit: the event must be a
 * calendar event record (its cid is read from its author's PDS rather than
 * trusted from the form), and the recipient must resolve to a DID.
 */
export async function readInvitationInput(
  formData: FormData
): Promise<InvitationInput> {
  const eventUri = String(formData.get('eventUri') ?? '')
  const markdown = String(formData.get('description') ?? '').trim()
  const handle = String(formData.get('recipient') ?? '')
    .trim()
    .replace(/^@/, '')
  if (!handle) return { error: 'recipient' }

  let eventCollection
  try {
    eventCollection = new AtUri(eventUri).collection
  } catch {
    return { error: 'event' }
  }
  if (eventCollection !== EVENT) return { error: 'event' }

  let event
  try {
    event = await fetchRecord(eventUri)
  } catch {
    event = null
  }
  if (!event) return { error: 'event' }

  let recipient
  try {
    recipient = await resolveDid(handle)
  } catch {
    return { error: 'recipient' }
  }
  if (!l.isDidString(recipient)) return { error: 'recipient' }

  return {
    subject: { uri: l.asAtUriString(event.uri), cid: event.cid },
    recipient,
    markdown,
  }
}
