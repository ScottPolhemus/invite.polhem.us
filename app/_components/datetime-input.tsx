'use client'

import { useEffect, useRef, useState } from 'react'

/** An ISO timestamp as the browser-local value a datetime-local input expects */
function toLocalInput(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(+date)) return ''
  return new Date(+date - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

/**
 * A date-time picker that submits an ISO UTC timestamp. The browser's input has
 * no timezone, so it's converted here, where the visitor's timezone is known,
 * rather than guessed on the server.
 *
 * `defaultValue` (an ISO timestamp, for editing) is shown in the visitor's
 * timezone once the page loads; until the field is touched, the original
 * timestamp is what gets submitted, so an untouched date is never reformatted.
 */
export default function DateTimeInput({
  id,
  name,
  required,
  className,
  defaultValue,
}: {
  id: string
  name: string
  required?: boolean
  className?: string
  defaultValue?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [touched, setTouched] = useState(false)
  const [local, setLocal] = useState('')

  // Filled after mount because the server doesn't know the visitor's timezone
  useEffect(() => {
    if (input.current && defaultValue)
      input.current.value = toLocalInput(defaultValue)
  }, [defaultValue])

  const date = local ? new Date(local) : null
  const typed = date && !Number.isNaN(+date) ? date.toISOString() : ''

  return (
    <>
      <input
        ref={input}
        id={id}
        type="datetime-local"
        onChange={(e) => {
          setTouched(true)
          setLocal(e.target.value)
        }}
        required={required}
        className={className}
      />
      <input
        type="hidden"
        name={name}
        value={touched ? typed : (defaultValue ?? '')}
      />
    </>
  )
}
