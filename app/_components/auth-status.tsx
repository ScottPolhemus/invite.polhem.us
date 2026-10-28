import { getSessionDid } from '@/lib/atproto/session'

export default async function AuthStatus() {
  const did = await getSessionDid()
  if (did) {
    return (
      <form action="/oauth/logout" method="post" className="mx-4 flex gap-2">
        <span className="truncate text-sm">{did}</span>
        <button className="underline">Sign out</button>
      </form>
    )
  }
  return (
    <form action="/oauth/login" method="post" className="mx-4 flex gap-2">
      <input
        name="handle"
        placeholder="you.bsky.social"
        required
        className="border-foreground rounded-full border px-3 py-2"
      />
      <button className="bg-foreground text-background rounded-full px-4 py-2">
        Sign in
      </button>
    </form>
  )
}
