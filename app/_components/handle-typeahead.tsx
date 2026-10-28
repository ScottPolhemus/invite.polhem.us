'use client'

import { useEffect, useId, useRef, useState } from 'react'

// Community actor search: https://tangled.org/zzstoatzz.io/typeahead
// Unauthenticated and CORS-enabled, rate limited per IP, so it is called
// straight from the browser and each user gets their own quota.
const SEARCH_URL =
  'https://typeahead.waow.tech/xrpc/tech.waow.typeahead.searchActors'
const CLIENT_ID = 'invite.polhem.us'
const DEBOUNCE_MS = 200

type Actor = {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

export default function HandleTypeahead({
  id,
  name,
  placeholder,
  className,
  containerClassName,
  ariaLabel,
  required = true,
  onCommit,
}: {
  id: string
  name: string
  placeholder?: string
  className?: string
  /** Classes for the wrapper that also positions the suggestion list */
  containerClassName?: string
  /** For fields without a visible <label> */
  ariaLabel?: string
  required?: boolean
  /** Called with the value when a suggestion is picked or the field loses focus */
  onCommit?: (value: string) => void
}) {
  const listId = useId()
  const [value, setValue] = useState('')
  const [actors, setActors] = useState<Actor[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // Skips the search triggered by picking a suggestion
  const quiet = useRef<string | null>(null)

  useEffect(() => {
    const q = value.trim().replace(/^@/, '')
    if (value === quiet.current || q.length < 2 || q.startsWith('did:')) return

    const abort = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${SEARCH_URL}?${new URLSearchParams({ q, limit: '8' })}`,
          { signal: abort.signal, headers: { 'X-Client': CLIENT_ID } }
        )
        if (!res.ok) return
        const data = (await res.json()) as { actors: Actor[] }
        setActors(data.actors)
        setActive(-1)
        setOpen(data.actors.length > 0)
      } catch {
        // Aborted by a newer keystroke, or the service is unreachable;
        // typing a full handle or DID still works without suggestions.
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [value])

  function pick(actor: Actor) {
    quiet.current = actor.handle
    setValue(actor.handle)
    onCommit?.(actor.handle)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % actors.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? actors.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(actors[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={`relative ${containerClassName ?? ''}`}>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false)
          onCommit?.(value)
        }}
        onFocus={() => actors.length > 0 && setOpen(true)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        required={required}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className={className}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="border-foreground bg-background absolute z-10 mt-1 w-full overflow-hidden rounded border shadow"
        >
          {actors.map((actor, i) => (
            <li
              key={actor.did}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault()
                pick(actor)
              }}
              className={`flex cursor-pointer items-center gap-2 p-2 ${
                i === active ? 'bg-foreground/10' : ''
              }`}
            >
              {actor.avatar ? (
                // Remote avatars from arbitrary CDNs, so next/image doesn't apply
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={actor.avatar}
                  alt=""
                  className="size-8 rounded-full"
                />
              ) : (
                <span className="bg-foreground/20 size-8 rounded-full" />
              )}
              <span className="flex min-w-0 flex-col">
                {actor.displayName && (
                  <span className="truncate">{actor.displayName}</span>
                )}
                <span className="truncate text-sm opacity-70">
                  @{actor.handle}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
