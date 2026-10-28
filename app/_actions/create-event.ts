'use server'

import { l } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { redirect } from 'next/navigation'

import * as event from '@/app/__generated__/lexicons/community/lexicon/calendar/event'
import { CREATED_WITH } from '@/lib/atproto/created-with'
import { readEventInput } from '@/lib/atproto/event-input'
import { getClient } from '@/lib/atproto/session'

const back = (error: string) => redirect(`/event/new?error=${error}`)

export async function createEvent(formData: FormData) {
  const client = await getClient()
  if (!client?.did) return back('auth')

  const input = readEventInput(formData)
  if ('error' in input) return back(input.error)

  // A variable, not an inline literal: createdWith isn't in the event lexicon
  const record = {
    name: input.name,
    startsAt: input.startsAt,
    ...(input.endsAt && { endsAt: input.endsAt }),
    mode: input.mode,
    status: input.status,
    ...(input.description && { description: input.description }),
    ...(input.link && { uris: [{ uri: input.link }] }),
    ...(input.address && {
      locations: [
        {
          $type: 'community.lexicon.location.address' as const,
          ...input.address,
        },
      ],
    }),
    createdAt: l.currentDatetimeString(),
    createdWith: CREATED_WITH,
  }
  const res = await client.create(event, record)

  // Events aren't stored locally; the page reads this one from the PDS
  const { did, rkey } = new AtUri(res.uri)
  redirect(`/event/${did}/${rkey}`)
}
