import Link from 'next/link'

import { getSessionDid } from '@/lib/atproto/session'
import { getAccountLabel } from '@/lib/data'

import NoticeBanner from '../ui/notice-banner'
import CopyLinkButton from './copy-link-button'

/**
 * Shown to the invitation's author (the account whose repo holds it), who is
 * looking at the page the recipient will see, with a shortcut to copy its link.
 */
export default async function InvitationPreviewBanner({
  author,
  rkey,
  recipient,
}: {
  /** The DID whose repo holds the invitation */
  author: string
  rkey: string
  recipient: string
}) {
  if ((await getSessionDid()) !== author) return null

  const { name, handle } = await getAccountLabel(recipient)

  return (
    <NoticeBanner>
      This is a preview of your invitation to <strong>{name}</strong>
      {handle && ` (@${handle})`}.{' '}
      <CopyLinkButton>Copy shareable link</CopyLinkButton>
      {' | '}
      <Link href={`/invitation/${author}/${rkey}/edit`} className="underline">
        Edit invitation
      </Link>
    </NoticeBanner>
  )
}
