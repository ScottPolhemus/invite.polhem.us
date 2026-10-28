'use client'

import { usePathname } from 'next/navigation'

/** Signs out and returns to the page you were on (the logout route only follows same-origin paths) */
export default function SignOutForm() {
  const pathname = usePathname()
  return (
    <form action="/oauth/logout" method="post">
      <input type="hidden" name="next" value={pathname} />
      <button className="underline">Sign out</button>
    </form>
  )
}
