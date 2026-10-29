'use client'

import { useEffect, useId, useRef, useState } from 'react'

import type { EventOption } from '@/lib/atproto/events'

const MAX_VISIBLE = 50

function label(e: EventOption) {
  return e.startsAt
    ? `${e.name} (${new Date(e.startsAt).toDateString()})`
    : e.name
}

/** Filter-as-you-type picker; submits the chosen event's AT URI as `name` */
export default function EventCombobox({
  id,
  name,
  events,
  className,
}: {
  id: string
  name: string
  events: EventOption[]
  className?: string
}) {
  const listId = useId()
  const only = events.length === 1 ? events[0] : null
  const [selected, setSelected] = useState<EventOption | null>(only)
  const [query, setQuery] = useState(only ? label(only) : '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const input = useRef<HTMLInputElement>(null)
  const activeItem = useRef<HTMLLIElement>(null)

  // Show everything while the field holds the chosen event's label
  const needle = selected ? '' : query.trim().toLowerCase()
  const matches = events.filter((e) => label(e).toLowerCase().includes(needle))
  const visible = matches.slice(0, MAX_VISIBLE)

  // Native form validation: a typed-but-unchosen value isn't a valid event
  useEffect(() => {
    input.current?.setCustomValidity(
      selected ? '' : 'Choose an event from the list'
    )
  }, [selected])

  useEffect(() => {
    activeItem.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function pick(e: EventOption) {
    setSelected(e)
    setQuery(label(e))
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) =>
        visible.length === 0 ? -1 : (i + step + visible.length) % visible.length
      )
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault()
      pick(visible[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.uri ?? ''} />
      <input
        ref={input}
        id={id}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setSelected(null)
          setActive(-1)
          setOpen(true)
        }}
        onFocus={(e) => {
          e.target.select()
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Search events by name"
        required
        autoComplete="off"
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
          className="border-foreground bg-background absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded border shadow"
        >
          {visible.map((e, i) => (
            <li
              key={e.uri}
              id={`${listId}-${i}`}
              ref={i === active ? activeItem : undefined}
              role="option"
              aria-selected={e.uri === selected?.uri}
              // mousedown fires before the input's blur closes the list
              onMouseDown={(ev) => {
                ev.preventDefault()
                pick(e)
              }}
              className={`cursor-pointer p-2 ${
                i === active ? 'bg-foreground/10' : ''
              }`}
            >
              {label(e)}
            </li>
          ))}
          {visible.length === 0 && (
            <li role="presentation" className="p-2 opacity-70">
              No matching events
            </li>
          )}
          {matches.length > visible.length && (
            <li role="presentation" className="p-2 text-sm opacity-70">
              {matches.length - visible.length} more, keep typing to narrow
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
