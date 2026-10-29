import { ReactNode } from 'react'

export default function PageHeader({
  heading,
  subHeading,
  body,
}: {
  heading?: string
  subHeading?: string
  body?: ReactNode
}) {
  return (
    <div className="bg-foreground/20 page-section">
      <div className="page-content">
        {!!heading && <h1 className="text-4xl">{heading}</h1>}
        {!!subHeading && <h2 className="text-2xl">{subHeading}</h2>}
        {!!body && typeof body === 'string' ? <p>{body}</p> : body}
      </div>
    </div>
  )
}
