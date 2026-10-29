'use client'

import { useEffect, useRef, useState } from 'react'

const RESET_MS = 2000

/**
 * A link-styled button that copies this page's address to the clipboard, then
 * briefly says so before going back to its label. The address is taken from the
 * browser (its origin and path, without any query or hash), so it's the page as
 * the visitor reached it, whatever host the app is served from.
 */
export default function CopyLinkButton({
  children,
}: {
  children: React.ReactNode
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    const url = window.location.origin + window.location.pathname
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      // No clipboard access (an insecure page, or permission refused)
      setState('failed')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), RESET_MS)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="underline"
      aria-live="polite"
    >
      {state === 'copied'
        ? 'Link copied!'
        : state === 'failed'
          ? 'Unable to copy, try sharing the current page from your browser!'
          : children}
    </button>
  )
}
