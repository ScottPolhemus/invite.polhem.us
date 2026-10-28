import { getSessionDid } from '@/lib/atproto/session'
import { getAccountLabel } from '@/lib/data'

import CopyLinkButton from './copy-link-button'

/**
 * Shown to the invitation's author (the account whose repo holds it), who is
 * looking at the page the recipient will see, with a shortcut to copy its link.
 */
export default async function InvitationPreviewBanner({
  author,
  recipient,
}: {
  /** The DID whose repo holds the invitation */
  author: string
  recipient: string
}) {
  if ((await getSessionDid()) !== author) return null

  const { name, handle } = await getAccountLabel(recipient)

  return (
    <div
      role="note"
      className="border-foreground bg-foreground/10 mx-4 mt-4 rounded border p-3 text-sm"
    >
      This is a preview of your invitation to <strong>{name}</strong>
      {handle && ` (@${handle})`}.{' '}
      <CopyLinkButton>Copy the link to share</CopyLinkButton>
    </div>
  )
}
